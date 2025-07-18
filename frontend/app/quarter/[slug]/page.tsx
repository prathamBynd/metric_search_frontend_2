"use client"

import { useState, useRef, type FC, useEffect } from "react"
import { Check, CheckCircle2, Clock, Edit, FileText, Loader2, Plus, Save, Upload, X, XCircle, Trash2 } from "lucide-react"
import dynamic from "next/dynamic"

// Dynamically import PDF viewer so it only renders on the client (avoids DOM APIs on the server)
const PdfScrollViewer = dynamic(() => import("@/components/pdf-scroll-viewer"), { ssr: false })
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import Image from "next/image"
import Link from "next/link"
import { Textarea } from "@/components/ui/textarea"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { useParams } from "next/navigation"
import { toast } from "@/hooks/use-toast"

// --- TYPES ---
type ReportStatus = "Received" | "Not Received"
type ExtractionStatus = "Idle" | "Processing" | "Complete"
type MetricStatus = "unconfirmed" | "verified" | "rejected"

interface Company {
  id: string
  name: string
  ticker: string
  reportStatus: ReportStatus
  extractionStatus: ExtractionStatus
  template: string | null
  reportUrls: string[]
  verification?: "unverified" | "verified"
}

interface FetchedValue {
  id: string
  name: string
  value: string
  coords: { top: string; left: string; width: string; height: string }
}

interface VerificationMetric {
  templateId: string
  name: string
  description: string
  fetchedValues: FetchedValue[]
  selectedValueId: string | null
  status: MetricStatus
}

// --- MOCK DATA ---
// (metric template list fetched dynamically)

// Companies will be fetched dynamically per quarter

// --- DEFAULT VERIFICATION METRICS ---
const initialVerificationMetrics: VerificationMetric[] = [
  {
    templateId: "m1",
    name: "Total Revenue",
    description: "Find 'Total Revenue' or 'Revenue from Operations'.",
    fetchedValues: [],
    selectedValueId: null,
    status: "unconfirmed",
  },
]

// Helper to convert slug like "fy25-q4" to "FY25 Q4"
function slugToTitle(slug: string) {
  const match = slug.match(/fy(\d{2})-q(\d)/i)
  if (!match) return slug.replace(/-/g, " ")
  const fy = match[1]
  const q = match[2]
  return `FY${fy} Q${q}`.toUpperCase()
}

// --- MAIN COMPONENT ---
export default function QuarterDetailPage() {
  // Retrieve dynamic route params using the client-side hook
  const params = useParams<{ slug: string }>()
  const [companies, setCompanies] = useState<Company[]>([])
  const [newCompanyName, setNewCompanyName] = useState("")
  const [verificationMetrics, setVerificationMetrics] = useState<VerificationMetric[]>(initialVerificationMetrics)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [activeCoords, setActiveCoords] = useState<FetchedValue["coords"] | null>(null)
  const [sheetMode, setSheetMode] = useState<"verify" | "viewReport">("verify")
  const [resultsCompany, setResultsCompany] = useState<Company | null>(null)

  // Fetch companies when slug available
  useEffect(() => {
    if (!params?.slug) return

    async function fetchCompanies() {
      try {
        const res = await fetch(`/api/quarters/${params.slug}/companies`)
        const data = await res.json()
        const fetched = data.companies as { id: string; name: string; reportFetched: boolean }[]

        const mapped: Company[] = fetched.map((c: any) => ({
          id: c.id,
          name: c.name,
          ticker: c.name.substring(0, 4).toUpperCase(),
          reportStatus: c.reportFetched ? "Received" : "Not Received",
          extractionStatus: "Idle",
          template: null,
          reportUrls: c.reportUrls || [],
          verification: "unverified",
        }))

        setCompanies(mapped)
      } catch (err) {
        console.error("Failed to load companies", err)
      }
    }

    fetchCompanies()
  }, [params?.slug])

  const checkResults = async (quarterTitle: string, companyName: string, templateName: string): Promise<boolean> => {
    try {
      const params = new URLSearchParams({
        quarter: quarterTitle,
        company: companyName,
        template: templateName,
      })
      const res = await fetch(`/api/results-status?${params.toString()}`)
      if (!res.ok) return false
      const data = await res.json()
      return Boolean(data.exists)
    } catch {
      return false
    }
  }

  const handleTemplateChange = async (companyId: string, templateId: string | null) => {
    setCompanies(companies.map((c) => (c.id === companyId ? { ...c, template: templateId } : c)))
    if (!templateId) return
    const company = companies.find((c) => c.id === companyId)
    if (!company) return
    const quarterTitle = slugToTitle(params.slug)
    const exists = await checkResults(quarterTitle, company.name, templateId)
    if (exists) {
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, extractionStatus: "Complete" } : c)))
    } else {
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, extractionStatus: "Idle" } : c)))
    }
  }

  // After companies fetched, check status for those with template
  useEffect(() => {
    async function refreshStatuses() {
      const quarterTitle = slugToTitle(params.slug)
      const updates = await Promise.all(
        companies.map(async (c) => {
          if (!c.template) return null
          const exists = await checkResults(quarterTitle, c.name, c.template)
          return { id: c.id, exists }
        }),
      )
      setCompanies((prev) =>
        prev.map((c) => {
          const match = updates.find((u) => u && u.id === c.id)
          if (!match) return c
          return { ...c, extractionStatus: match.exists ? "Complete" : c.extractionStatus }
        }),
      )
    }
    if (companies.length) refreshStatuses()
  }, [companies.length, params.slug])

  const handleAddCompany = () => {
    const trimmed = newCompanyName.trim()
    if (!trimmed) return
    // Prevent duplicates (case-insensitive)
    if (companies.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) {
      toast({
        variant: "destructive",
        title: "Duplicate Company",
        description: `A company named "${trimmed}" already exists.`,
      })
      return
    }
    const newCompany: Company = {
      id: `comp-${Date.now()}`,
      name: trimmed,
      ticker: trimmed.substring(0, 4).toUpperCase(),
      reportStatus: "Not Received",
      extractionStatus: "Idle",
      template: null,
      reportUrls: [],
      verification: "unverified",
    }
    setCompanies((prev) => [...prev, newCompany])
    setNewCompanyName("")
  }

  const handleProcess = async (companyId: string) => {
    const targetCompany = companies.find((c) => c.id === companyId)
    if (!targetCompany || !targetCompany.template) return

    // Mark as processing
    setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, extractionStatus: "Processing" } : c)))

    // Helper to build quarter title and time period
    const quarterTitle = slugToTitle(params.slug)
    const [fyPart, qPart] = quarterTitle.split(" ") // ["FY25", "Q4"]
    const timePeriod = `${qPart}${fyPart}` // "Q4FY25"

    try {
      const apiBase = process.env.NEXT_PUBLIC_FASTAPI_BASE_URL || ""
      const resp = await fetch(`${apiBase}/api/extract-metrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_name: targetCompany.template,
          time_period: timePeriod,
        }),
      })

      if (!resp.ok) {
        console.error("Extraction failed", await resp.text())
        throw new Error("Extraction failed")
      }

      // Mark as complete upon success
      setCompanies((prev) =>
        prev.map((c) =>
          c.id === companyId ? { ...c, extractionStatus: c.extractionStatus === "Processing" ? "Complete" : "Idle" } : c,
        ),
      )
    } catch (err) {
      console.error(err)
      setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, extractionStatus: "Idle" } : c)))
    }
  }

  const handleProcessAll = () => {
    companies.forEach((c) => {
      if (c.reportStatus === "Received" && c.extractionStatus === "Idle" && c.template) {
        handleProcess(c.id)
      }
    })
  }

  const handleViewReport = (url: string) => {
    if (url) {
      window.open(url, "_blank")
    }
  }

  const handleViewResults = (company: Company) => {
    setSelectedCompany(company)
    setResultsCompany(company)
    setVerificationMetrics(initialVerificationMetrics)
    setActiveCoords(null)
    setSheetMode("viewReport")
    setIsSheetOpen(true)
  }

  const handleMetricUpdate = (updatedMetric: VerificationMetric) => {
    setVerificationMetrics((prev) => prev.map((m) => (m.templateId === updatedMetric.templateId ? updatedMetric : m)))
  }

  const handleLiveRefetch = (templateId: string) => {
    console.log(`Refetching metrics for templateId: ${templateId}...`)
    setVerificationMetrics((prev) =>
      prev.map((m) => {
        if (m.templateId === templateId) {
          console.log(`Updating template file for: ${m.name}`)
          return {
            ...m,
            status: "unconfirmed",
            selectedValueId: null,
            fetchedValues: [
              {
                id: `v${Math.random()}`,
                name: "Refetched Metric",
                value: `₹${(Math.random() * 10000).toFixed(2)} Cr`,
                coords: {
                  top: `${Math.random() * 80 + 10}%`,
                  left: `${Math.random() * 80 + 10}%`,
                  width: "30%",
                  height: "8%",
                },
              },
            ],
          }
        }
        return m
      }),
    )
  }

  const handleDeleteCompany = async (company: Company) => {
    if (!window.confirm(`Are you sure you want to delete ${company.name}? This will remove its data.`)) return
    try {
      const res = await fetch(`/api/quarters/${params.slug}/companies`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company: company.name }),
      })
      if (!res.ok) throw new Error(await res.text())
      setCompanies((prev) => prev.filter((c) => c.id !== company.id))
      toast({ title: "Company Deleted", description: `${company.name} has been removed.` })
    } catch (err) {
      console.error(err)
      toast({ variant: "destructive", title: "Delete Failed", description: "Could not delete the company." })
    }
  }

  return (
    <div className="bg-gray-50 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-900 mb-2 inline-flex items-center gap-1">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
          </svg>
          Back to Quarters
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 uppercase">{params?.slug}</h1>
      </header>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Company Reports</CardTitle>
            <CardDescription>Process reports and verify extracted financial metrics.</CardDescription>
          </div>
          <Button onClick={handleProcessAll}>Process All</Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-[60vh] overflow-y-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Report</TableHead>
                  <TableHead>Metric Template</TableHead>
                  <TableHead>Verification Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {companies.map((company) => (
                  <TableRow key={company.id}>
                    <TableCell className="font-medium">{company.name}</TableCell>
                    <TableCell>
                      <ReportStatusCell
                        reports={company.reportUrls}
                        onViewReport={(url) => handleViewReport(url)}
                        quarter={slugToTitle(params.slug)}
                        companyName={company.name}
                        onUploaded={(url) => {
                          // mark as received
                          setCompanies((prev) =>
                            prev.map((c) =>
                              c.id === company.id
                                ? { ...c, reportStatus: "Received", reportUrls: [...c.reportUrls, url] }
                                : c,
                            ),
                          )
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <MetricTemplateSelector
                        selectedTemplate={company.template}
                        onSelect={(templateId) => handleTemplateChange(company.id, templateId)}
                        docs={company.reportUrls}
                      />
                    </TableCell>
                    <TableCell>
                      {!company.template ? null : company.verification === "verified" ? (
                        <span className="flex items-center gap-1 text-green-700 font-medium">
                          <CheckCircle2 className="h-4 w-4" /> Verified
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-amber-600 font-medium">
                          {/* small yellow dot */}
                          <svg className="h-2 w-2 fill-amber-400" viewBox="0 0 8 8"><circle cx="4" cy="4" r="4"/></svg>
                          Unverified
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <ActionButton
                          company={company}
                          onProcess={() => handleProcess(company.id)}
                          onViewResults={() => handleViewResults(company)}
                        />
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteCompany(company)}>
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AddCompanyForm value={newCompanyName} onChange={setNewCompanyName} onAdd={handleAddCompany} />

      {sheetMode === "verify" ? (
      <VerificationSheet
        isOpen={isSheetOpen}
          onOpenChange={(open) => {
            setIsSheetOpen(open)
            if (!open) setSheetMode("verify")
          }}
        company={selectedCompany}
        metrics={verificationMetrics}
        activeCoords={activeCoords}
        onMetricUpdate={handleMetricUpdate}
        onSelectValue={(value) => setActiveCoords(value?.coords ?? null)}
        onLiveRefetch={handleLiveRefetch}
      />
      ) : (
        <ResultsSheet
          isOpen={isSheetOpen}
          onOpenChange={(open) => {
            setIsSheetOpen(open)
            if (!open) setSheetMode("verify")
          }}
          company={resultsCompany}
          quarterTitle={slugToTitle(params.slug)}
          onCompanyVerified={(companyId) => {
            setCompanies((prev) => prev.map((c) => (c.id === companyId ? { ...c, verification: "verified" } : c)))
          }}
        />
      )}
    </div>
  )
}

// --- SUB-COMPONENTS ---

const ReportStatusCell: FC<{
  reports: string[]
  onViewReport: (url: string) => void
  quarter: string
  companyName: string
  onUploaded: (url: string) => void
}> = ({ reports, onViewReport, quarter, companyName, onUploaded }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleSelect = () => fileInputRef.current?.click()
  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const form = new FormData()
    form.append("file", file)
    form.append("quarter", quarter)
    form.append("company", companyName)
    try {
      const res = await fetch("/api/upload-report", { method: "POST", body: form })
      const data = await res.json()
      if (data.url) {
        onUploaded(data.url as string)
      }
    } catch (err) {
      console.error("upload failed", err)
    }
  }
  const hasReports = reports.length > 0

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {hasReports ? (
        <>
          {reports.map((url, idx) => {
            const rawPart = url.split("/").pop() || ""
            const decoded = decodeURIComponent(rawPart)
            const name = decoded.split("/").pop() || `Doc ${idx + 1}`
            return (
              <Button
                key={idx}
                variant="secondary"
                size="sm"
                className="h-6 text-xs px-2 py-1"
                onClick={() => onViewReport(url)}
              >
                <FileText className="h-3 w-3 mr-1" />
                {name.length > 20 ? name.slice(0, 17) + "…" : name}
              </Button>
            )
          })}
        </>
      ) : (
        <span className="flex items-center gap-1.5 text-amber-700">
          <Clock className="h-4 w-4" />
          <span className="font-medium">Awaiting</span>
        </span>
      )}
      <input type="file" accept="application/pdf" className="hidden" ref={fileInputRef} onChange={handleChange} />
      <Button variant="outline" size="sm" className="h-6 bg-transparent" onClick={handleSelect}>
        <Upload className="h-3 w-3 mr-1" />
        {hasReports ? "Add" : "Upload"}
      </Button>
    </div>
  )
}

const AddCompanyForm: FC<{ value: string; onChange: (value: string) => void; onAdd: () => void }> = ({
  value,
  onChange,
  onAdd,
}) => (
  <div className="mt-6">
    <div className="flex w-full max-w-sm items-center space-x-2">
      <Input
        type="text"
        placeholder="Enter company name"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onAdd()}
      />
      <Button type="submit" onClick={onAdd}>
        <Plus className="h-4 w-4 mr-2" />
        Add
      </Button>
    </div>
  </div>
)

const MetricTemplateSelector: FC<{
  selectedTemplate: string | null
  onSelect: (templateId: string | null) => void
  docs: string[]
}> = ({ selectedTemplate, onSelect, docs }) => {
  const [templates, setTemplates] = useState<string[]>([])
  const [rows, setRows] = useState<{ metric: string; custom_instruction: string; docUrl: string }[]>([
    {
      metric: "",
      custom_instruction: "",
      docUrl: docs[0] || "",
    },
  ])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<string | null>(null)

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/metric-templates")
      const data = await res.json()
      setTemplates(data.templates as string[])
    } catch (err) {
      console.error("Failed to load metric templates", err)
    }
  }

  // Listen for global template updates
  useEffect(() => {
    loadTemplates()
    const handler = () => loadTemplates()
    window.addEventListener("templates-updated", handler)
    return () => window.removeEventListener("templates-updated", handler)
  }, [])

  const addRow = () => setRows([...rows, { metric: "", custom_instruction: "", docUrl: docs[0] || "" }])
  const updateRow = (
    index: number,
    field: "metric" | "custom_instruction" | "docUrl",
    value: string,
  ) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  // Handle Excel-style paste (tab-separated rows / columns)
  const handlePaste = (
    e: React.ClipboardEvent<HTMLInputElement>,
    startRow: number,
    colIndex: 0 | 1,
  ) => {
    const text = e.clipboardData.getData("text/plain")
    if (!text.includes("\n") && !text.includes("\t")) return // let default paste

    e.preventDefault()

    const lines = text.trim().split(/\r?\n/)
    let newRows = [...rows]

    lines.forEach((line, i) => {
      const cols = line.split("\t")
      const target = startRow + i
      if (target >= newRows.length) newRows.push({ metric: "", custom_instruction: "", docUrl: docs[0] || "" })

      // Paste starting column then fill to the right
      if (colIndex === 0) {
        newRows[target].metric = cols[0] || ""
        if (cols.length > 1) newRows[target].custom_instruction = cols[1] || newRows[target].custom_instruction
      } else {
        newRows[target].custom_instruction = cols[0] || ""
      }
    })

    setRows(newRows)
  }

  const saveTemplate = async (templateName: string) => {
    const trimmed = templateName.trim()
    if (!trimmed) {
      toast({
        variant: "destructive",
        title: "Missing Template Name",
        description: "Please provide a template name before saving.",
      })
      return
    }

    // Prevent duplicate names (case-insensitive) unless we are editing the same template
    const duplicateExists = templates.some(
      (t) => t.toLowerCase() === trimmed.toLowerCase() && t.toLowerCase() !== (editingTemplate || "").toLowerCase(),
    )

    if (duplicateExists) {
      toast({
        variant: "destructive",
        title: "Duplicate Template",
        description: `A template named "${trimmed}" already exists. Please choose another name.`,
      })
      return
    }

    try {
      const resp = await fetch("/api/metric-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          metrics: rows.map((r) => ({
            metric: r.metric,
            custom_instruction: r.custom_instruction,
            pdf_blob_url: r.docUrl || "",
          })),
        }),
      })

      if (!resp.ok) {
        const message = resp.status === 409 ?
          `A template named "${trimmed}" already exists.` :
          "Failed to save the template. Please try again.";
        toast({ variant: "destructive", title: "Error Saving Template", description: message })
        return
      }

      await loadTemplates()
      setIsDialogOpen(false)
      // Notify other selectors to refresh
      window.dispatchEvent(new Event("templates-updated"))
    } catch (err) {
      console.error("Failed to save template", err)
      toast({ variant: "destructive", title: "Network Error", description: "Could not save template. Please try again." })
    }
  }

  const deleteTemplate = async (templateName: string) => {
    if (!window.confirm(`Are you sure you want to delete the template \"${templateName}\"?`)) return
    try {
      const resp = await fetch(`/api/metric-templates/${encodeURIComponent(templateName)}`, {
        method: "DELETE",
      })
      if (!resp.ok) throw new Error(await resp.text())
      await loadTemplates()
      // If the deleted template was selected, clear selection
      if (selectedTemplate && selectedTemplate.toLowerCase() === templateName.toLowerCase()) {
        onSelect(null)
      }
      toast({ title: "Template Deleted", description: `${templateName} removed successfully.` })
    } catch (err) {
      console.error("Failed to delete template", err)
      toast({ variant: "destructive", title: "Delete Failed", description: "Could not delete template." })
    }
  }

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <Select
        value={selectedTemplate || "none"}
        onValueChange={(value) => {
          if (value !== "add_new") {
            onSelect(value === "none" ? null : value)
          }
        }}
      >
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder="Select a template" />
        </SelectTrigger>
        <SelectContent className="z-50">
          <SelectItem value="none">None</SelectItem>
          {templates.map((name) => (
            <SelectItem key={name} value={name} className="pr-14 relative group">
              {name}
              <span
                className="absolute right-8 top-1/2 -translate-y-1/2 cursor-pointer flex items-center opacity-0 group-hover:opacity-100"
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onPointerUp={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={async (e) => {
                  e.stopPropagation()
                  try {
                    const resp = await fetch(`/api/metric-templates/${encodeURIComponent(name)}`)
                    const data = await resp.json()
                    const metricsRaw = (data.metrics || []) as { metric: string; custom_instruction: string; pdf_blob_url?: string; docUrl?: string }[]
                    const normalized = metricsRaw.map((m) => ({
                      metric: m.metric,
                      custom_instruction: m.custom_instruction,
                      docUrl: m.docUrl || m.pdf_blob_url || docs[0] || "",
                    }))
                    setRows(normalized.length ? normalized : [{ metric: "", custom_instruction: "", docUrl: docs[0] || "" }])
                    setEditingTemplate(name)
                    setIsDialogOpen(true)
                  } catch (err) {
                    console.error("Failed to load template for editing", err)
                  }
                }}
              >
                <Edit className="h-4 w-4 text-gray-500 hover:text-gray-700" />
              </span>
              <span
                className="absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer flex items-center opacity-0 group-hover:opacity-100"
                onPointerDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onPointerUp={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={async (e) => {
                  e.stopPropagation()
                  await deleteTemplate(name)
                }}
              >
                <Trash2 className="h-4 w-4 text-red-500 hover:text-red-700" />
              </span>
            </SelectItem>
          ))}
          <SelectSeparator />
          <DialogTrigger asChild value="add_new">
            <div className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent">
              <Plus className="h-4 w-4 mr-2" /> Add New Template
            </div>
          </DialogTrigger>
        </SelectContent>
      </Select>

      {/* Modal */}
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>{editingTemplate ? `Edit Template – ${editingTemplate}` : "Create Metric Template"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            placeholder="Template Name"
            id="templateNameInput"
            defaultValue={editingTemplate || ""}
          />

          <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead>Metric Name</TableHead>
                  <TableHead>Extraction Instruction</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, index) => (
                  <TableRow key={index}>
                    {/* Metric Name cell */}
                    <TableCell
                      contentEditable
                      suppressContentEditableWarning
                      className="outline-none w-full min-w-[180px] px-2 py-1 align-top border-r border-gray-200"
                      style={{ width: "30%" }}
                      onBlur={(e) => updateRow(index, "metric", (e.target as HTMLElement).innerText)}
                      onPaste={(e) => handlePaste(e as any, index, 0)}
                    >
                      {row.metric}
                    </TableCell>

                    {/* Extraction Instruction cell */}
                    <TableCell
                      contentEditable
                      suppressContentEditableWarning
                      className="outline-none w-full px-2 py-1 align-top"
                      onBlur={(e) => updateRow(index, "custom_instruction", (e.target as HTMLElement).innerText)}
                      onPaste={(e) => handlePaste(e as any, index, 1)}
                    >
                      {row.custom_instruction}
                    </TableCell>

                    {/* Document selection */}
                    <TableCell className="align-top w-40">
                      <Select
                        value={row.docUrl}
                        onValueChange={(val) => updateRow(index, "docUrl", val)}
                      >
                        <SelectTrigger className="w-full h-8">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          {docs.map((d) => {
                            const raw = d.split("/").pop() || ""
                            const decoded = decodeURIComponent(raw)
                            const name = decoded.split("/").pop() || "Doc"
                            return (
                              <SelectItem key={d} value={d} className="truncate">
                                {name}
                              </SelectItem>
                            )
                          })}
                        </SelectContent>
                      </Select>
                    </TableCell>

                    <TableCell className="w-8 align-top">
                      <Button variant="ghost" size="icon" onClick={() => setRows(rows.filter((_, i) => i !== index))}>
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button variant="outline" onClick={addRow}>
            <Plus className="h-4 w-4 mr-2" /> Add Row
          </Button>
        </div>
        <DialogFooter>
          <Button
            onClick={() => {
              const nameInput = document.getElementById("templateNameInput") as HTMLInputElement | null
              saveTemplate(nameInput?.value ?? "")
              setEditingTemplate(null)
            }}
          >
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const ActionButton: FC<{
  company: Company
  onProcess: () => void
  onViewResults: () => void
}> = ({ company, onProcess, onViewResults }) => {
  const { reportStatus, extractionStatus, template } = company

  if (reportStatus === "Not Received" || !template) {
    return (
      <Button size="sm" disabled>
        Extract Metrics
      </Button>
    )
  }

  switch (extractionStatus) {
    case "Idle":
      return (
        <Button size="sm" onClick={onProcess}>
          Extract Metrics
        </Button>
      )
    case "Processing":
      return (
        <Button size="sm" disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Processing...
        </Button>
      )
    case "Complete":
      return (
        <div className="flex flex-col gap-2 items-end">
        <Button size="sm" variant="secondary" onClick={onViewResults}>
          View Results
        </Button>
          <Button size="sm" variant="outline" onClick={onProcess}>
            Extract Again
          </Button>
        </div>
      )
    default:
      return null
  }
}

const VerificationSheet: FC<{
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  company: Company | null
  metrics: VerificationMetric[]
  activeCoords: FetchedValue["coords"] | null
  onMetricUpdate: (metric: VerificationMetric) => void
  onSelectValue: (value: FetchedValue | null) => void
  onLiveRefetch: (templateId: string) => void
}> = ({ isOpen, onOpenChange, company, metrics, activeCoords, onMetricUpdate, onSelectValue, onLiveRefetch }) => {
  if (!company) return null

  const allMetricsResolved = metrics.every((m) => m.status === "verified" || m.status === "rejected")

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-[90vw] lg:max-w-[80vw] xl:max-w-[70vw] p-0 flex
        [&_button[data-radix-sheet-close]]:hidden
        [&_button[data-radix-dialog-close]]:hidden"
      >
        {/* Hidden title for accessibility */}
        <SheetHeader className="sr-only">
          <SheetTitle>Extraction Results</SheetTitle>
        </SheetHeader>
        <div className="w-1/3 border-r bg-white flex flex-col">
          <SheetHeader className="p-4 text-left border-b">
            <SheetTitle className="text-lg font-semibold">Verify {company.ticker} Metrics</SheetTitle>
          </SheetHeader>
          <div className="flex-grow overflow-y-auto p-4 space-y-4">
            {metrics.map((metric) => (
              <MetricVerificationItem
                key={metric.templateId}
                metric={metric}
                onUpdate={onMetricUpdate}
                onSelectValue={onSelectValue}
                onLiveRefetch={onLiveRefetch}
              />
            ))}
          </div>
          <div className="p-4 border-t">
            <Button className="w-full" disabled={!allMetricsResolved}>
              <FileText className="h-4 w-4 mr-2" />
              Export All
            </Button>
          </div>
        </div>
        <div className="w-2/3 flex flex-col bg-gray-100">
          <div className="flex-shrink-0 p-4 border-b bg-white flex justify-between items-center">
            <h3 className="font-semibold">{company.name} - Financial Report</h3>
            <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="flex-grow p-6 overflow-hidden relative">
            <Image
              src={company.reportUrls[0] || "/placeholder.svg?height=800&width=600"}
              alt="Financial Report"
              layout="fill"
              objectFit="contain"
            />
            {activeCoords && (
              <div
                className="absolute border-2 border-primary bg-primary/20 rounded-md transition-all duration-300"
                style={{ ...activeCoords }}
              />
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

const MetricVerificationItem: FC<{
  metric: VerificationMetric
  onUpdate: (metric: VerificationMetric) => void
  onSelectValue: (value: FetchedValue | null) => void
  onLiveRefetch: (templateId: string) => void
}> = ({ metric, onUpdate, onSelectValue, onLiveRefetch }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(metric.name)
  const [editedDescription, setEditedDescription] = useState(metric.description)

  const handleSelectValue = (value: FetchedValue) => {
    const newSelectedId = metric.selectedValueId === value.id ? null : value.id
    onUpdate({ ...metric, selectedValueId: newSelectedId })
    onSelectValue(newSelectedId ? value : null)
  }

  const handleStatusChange = (newStatus: "verified" | "rejected") => {
    if (newStatus === "verified" && !metric.selectedValueId) return
    onUpdate({ ...metric, status: newStatus })
  }

  const handleSaveEdit = () => {
    onUpdate({ ...metric, name: editedName, description: editedDescription })
    setIsEditing(false)
    onLiveRefetch(metric.templateId)
  }

  useEffect(() => {
    if (metric.selectedValueId && !metric.fetchedValues.some((v) => v.id === metric.selectedValueId)) {
      onUpdate({ ...metric, selectedValueId: null })
      onSelectValue(null)
    }
  }, [metric.fetchedValues, metric.selectedValueId, onUpdate, onSelectValue])

  const showRejectAll = metric.fetchedValues.length > 1

  return (
    <Card className="bg-white">
      <CardHeader className="pb-3 group relative">
        <div className="flex justify-between items-start">
          {isEditing ? (
            <div className="flex-grow space-y-2">
              <Input value={editedName} onChange={(e) => setEditedName(e.target.value)} className="h-8" />
              <Textarea
                value={editedDescription}
                onChange={(e) => setEditedDescription(e.target.value)}
                className="text-sm"
                rows={3}
              />
            </div>
          ) : (
            <div className="flex-grow pr-8">
              <CardTitle className="text-base font-semibold">{metric.name}</CardTitle>
              <CardDescription className="text-xs mt-1">{metric.description}</CardDescription>
            </div>
          )}
          <div className="absolute top-2 right-2 flex items-center">
            {isEditing ? (
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={handleSaveEdit}>
                <Save className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => setIsEditing(true)}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
            {metric.status === "verified" && <CheckCircle2 className="h-5 w-5 text-green-500 ml-1" />}
            {metric.status === "rejected" && <XCircle className="h-5 w-5 text-red-500 ml-1" />}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {metric.fetchedValues.length > 0 ? (
          <div className="space-y-2">
            {metric.fetchedValues.map((value) => (
              <button
                key={value.id}
                onClick={() => handleSelectValue(value)}
                className={cn(
                  "w-full text-left p-2 rounded-md border text-sm transition-colors",
                  metric.selectedValueId === value.id ? "bg-primary/10 border-primary" : "bg-gray-50 hover:bg-gray-100",
                )}
              >
                <div className="font-medium">{value.name}</div>
                <div className="text-gray-600">{value.value}</div>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-2">No metrics found. Try editing the instruction.</p>
        )}
        {(metric.selectedValueId || showRejectAll) && (
          <div className="mt-3 pt-3 border-t flex justify-end">
            <ToggleGroup
              type="single"
              value={metric.status !== "unconfirmed" ? metric.status : ""}
              onValueChange={(value: "verified" | "rejected") => {
                if (value) handleStatusChange(value)
              }}
            >
              <ToggleGroupItem value="rejected" aria-label="Reject">
                <X className="h-4 w-4 mr-2" />
                {showRejectAll ? "Reject All" : "Reject"}
              </ToggleGroupItem>
              <ToggleGroupItem value="verified" aria-label="Confirm" disabled={!metric.selectedValueId}>
                <Check className="h-4 w-4 mr-2" />
                Confirm
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ---------------- Results Sheet -----------------
interface ResultsSheetProps {
  isOpen: boolean
  onOpenChange: (o: boolean) => void
  company: Company | null
  quarterTitle: string
  onCompanyVerified: (companyId: string) => void
}

const ResultsSheet: FC<ResultsSheetProps> = ({ isOpen, onOpenChange, company, quarterTitle, onCompanyVerified }) => {
  const [results, setResults] = useState<Record<string, any> | null>(null)
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null)
  // Incrementing this triggers the PDF viewer to scroll even if the page number hasn’t changed.
  const [scrollSignal, setScrollSignal] = useState(0)
  // pageIndex removed – we now always jump directly to the correct page via PDF hash param
  const [verifiedMap, setVerifiedMap] = useState<Record<string, boolean>>({})
  const [isExporting, setIsExporting] = useState(false)
  const verifiedSentRef = useRef(false)

  useEffect(() => {
    if (!company || !company.template) return
    async function fetchResults() {
      try {
        if (!company) return
        const qs = new URLSearchParams({
          quarter: quarterTitle,
          company: company.name,
          template: company.template as string,
        })
        const resp = await fetch(`/api/results?${qs.toString()}`)
        if (!resp.ok) throw new Error("Failed to fetch results.json")
        const data = await resp.json()
        setResults(data)
        const firstMetric = Object.keys(data)[0]
        setSelectedMetric(firstMetric)
        setScrollSignal((s) => s + 1)
      } catch (err) {
        console.error(err)
      }
    }
    fetchResults()
  }, [company, quarterTitle])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!isOpen) return
      // Space: verify current metric and advance
      if (e.code === "Space" && selectedMetric) {
        e.preventDefault()
        setVerifiedMap((prev) => ({ ...prev, [selectedMetric]: true }))
        if (results) {
          const keys = Object.keys(results)
          const idx = keys.indexOf(selectedMetric)
          if (idx < keys.length - 1) {
            setSelectedMetric(keys[idx + 1])
            setScrollSignal((s) => s + 1)
          }
        }
        return
      }

      // Arrow navigation without verification
      if (results && ["ArrowDown", "ArrowRight", "ArrowUp", "ArrowLeft"].includes(e.code)) {
        e.preventDefault()
        if (!selectedMetric) return
        const keys = Object.keys(results)
        const idx = keys.indexOf(selectedMetric)
        let newIdx = idx
        if ((e.code === "ArrowDown" || e.code === "ArrowRight") && idx < keys.length - 1) {
          newIdx = idx + 1
        } else if ((e.code === "ArrowUp" || e.code === "ArrowLeft") && idx > 0) {
          newIdx = idx - 1
        }
        if (newIdx !== idx) {
          setSelectedMetric(keys[newIdx])
          setScrollSignal((s) => s + 1)
        }
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [isOpen, selectedMetric, results])

  useEffect(() => {
    if (!company || !results) return
    const allDone = Object.keys(results).length > 0 && Object.keys(results).every((k) => verifiedMap[k])
    if (allDone && !verifiedSentRef.current) {
      onCompanyVerified(company.id)
      verifiedSentRef.current = true
    }
  }, [verifiedMap, results, company, onCompanyVerified])

  // reset flag when company changes / sheet reopened
  useEffect(() => { verifiedSentRef.current = false }, [company?.id])

  const metricData = selectedMetric && results ? results[selectedMetric] : null
  // --------------------------------------------------------------------
  // Adapt to new results structure
  // --------------------------------------------------------------------
  const firstCitation = metricData?.citation_coords?.[0] || null
  const pageNumber: number | null = firstCitation ? firstCitation.page : null
  const bbox: number[] | null = firstCitation ? firstCitation.coords : null // [x1, y1, x2, y2]

  // The original report PDF lives on the company object (first uploaded report)
  const rawReportUrl: string | null = company?.reportUrls?.[0] || null
  // Proxy through our Next.js API to bypass Azure Blob CORS restrictions
  const reportUrl: string | null = rawReportUrl ? `/api/proxy?url=${encodeURIComponent(rawReportUrl)}` : null

  // Highlight rectangle will now be calculated inside PdfScrollViewer using
  // PDF.js viewport helpers. We just pass the raw Fitz coordinates when the
  // user selects a metric.

  type PdfHighlight = {
    page: number
    coords: number[]
  }

  // The highlight remains visible; no timeout required.

  const highlight: PdfHighlight | null = bbox && pageNumber != null ? { page: pageNumber, coords: bbox } : null

  /* --------------------------------------------------------------------
   * Export to Excel handler
   * ------------------------------------------------------------------*/
  const handleExport = async () => {
    if (!company || !results) return
    try {
      setIsExporting(true)
      const encodedQuarter = encodeURIComponent(quarterTitle)
      const encodedCompany = encodeURIComponent(company.name)
      const jsonUrl = `https://byndpdfstorage.blob.core.windows.net/metric-workflow/${encodedQuarter}/${encodedCompany}/${company.template}/results.json`

      const apiBase = process.env.NEXT_PUBLIC_FASTAPI_BASE_URL || ""
      const resp = await fetch(`${apiBase}/api/metrics-to-excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json_url: jsonUrl }),
      })

      if (!resp.ok) {
        console.error("Export failed", await resp.text())
        throw new Error("Export failed")
      }

      const { filename, excel_base64 } = await resp.json()
      const link = document.createElement("a")
      link.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${excel_base64}`
      link.download = filename || "metrics.xlsx"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error(err)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-[90vw] lg:max-w-[80vw] xl:max-w-[70vw] p-0 flex
        [&>button]:hidden"
      >
        {/* Hidden title for accessibility */}
        <SheetHeader className="sr-only">
          <SheetTitle>Extraction Results</SheetTitle>
        </SheetHeader>
        {/* Left metrics list with export button */}
        <div className="w-1/4 border-r bg-white overflow-y-auto">
          <div className="p-4 border-b font-semibold flex items-center justify-between gap-2">
            <span>{company?.name} – Extracted Metrics</span>
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
              variant="default"
              disabled={isExporting || !results || Object.keys(results).length === 0 || !Object.keys(results).every((k) => verifiedMap[k])}
              onClick={handleExport}
            >
              {isExporting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Export
            </Button>
          </div>
          {results ? (
            <ul>
              {Object.keys(results).map((m) => {
                const r = results[m] || {}
                const infoParts = [r.unit, r.extracted_value, r.denomination].filter(Boolean)
                const infoLine = infoParts.join(" ")
                return (
                  <li key={m}>
                    <button
                      className={`relative w-full text-left px-4 py-2 hover:bg-gray-100 ${selectedMetric === m ? "bg-primary/10" : ""}`}
                      onClick={() => {
                        setSelectedMetric(m)
                        setScrollSignal((s) => s + 1)
                      }}
                    >
                      <div className="font-medium">{m}</div>
                      {infoLine && <div className="text-xs text-gray-600 mt-0.5">{infoLine}</div>}
                      {!verifiedMap[m] ? (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-amber-400" />
                      ) : (
                        <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-green-600" />
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="p-4 text-sm text-gray-500">Loading...</div>
          )}
        </div>

        {/* Right PDF viewer */}
        <div className="w-3/4 flex flex-col bg-gray-100">
          {reportUrl ? (
            <div className="flex-grow relative">
              {/* Close button overlay (bottom-right) */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onOpenChange(false)}
                className="absolute bottom-4 right-4 z-10 bg-white/80 backdrop-blur-sm rounded-full"
              >
                <X className="h-5 w-5" />
              </Button>

              {/* PDF with smooth scroll & automatic viewport-based highlight */}
              {reportUrl && (
                <PdfScrollViewer
                  fileUrl={reportUrl}
                  targetPage={pageNumber}
                  scrollSignal={scrollSignal}
                  highlight={highlight}
                />
              )}
            </div>
          ) : (
            <div className="flex-grow flex items-center justify-center text-gray-500">No report available</div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
