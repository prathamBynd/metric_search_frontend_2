"use client"

import { useState, useEffect, type FC } from "react"
import { CheckCircle2, Plus, X, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import Link from "next/link"
import { ChevronRight } from "lucide-react"

// --- TYPES ---
type CompanyStatus = "Fetched" | "Upload Required"
type MetricStatus = "unconfirmed" | "verified" | "rejected" | "selected"

interface Company {
  id: string
  name: string
  ticker: string
  reportStatus: CompanyStatus
  template: string | null
  reportUrl?: string
}

interface Metric {
  name: string
  value: string
  status: MetricStatus
  coords: { top: string; left: string; width: string; height: string }
}

interface Quarter {
  slug: string
  title: string
  description: string
}

interface CompanyStatusItem {
  id: string
  name: string
  reportFetched: boolean
}

// --- MOCK DATA (for companies & metrics) ---
const initialCompanies: Company[] = [
  {
    id: "infy",
    name: "Infosys",
    ticker: "INFY",
    reportStatus: "Fetched",
    template: "T1",
    reportUrl: "/placeholder.svg?height=800&width=600",
  },
  {
    id: "tcs",
    name: "Tata Consultancy Services",
    ticker: "TCS",
    reportStatus: "Upload Required",
    template: null,
  },
  {
    id: "wipro",
    name: "Wipro",
    ticker: "WIPRO",
    reportStatus: "Fetched",
    template: null,
    reportUrl: "/placeholder.svg?height=800&width=600",
  },
]

const initialMetrics: Metric[] = [
  {
    name: "Revenue",
    value: "₹9421.68Cr",
    status: "unconfirmed",
    coords: { top: "35%", left: "8%", width: "38%", height: "10%" },
  },
  {
    name: "EBITDA",
    value: "₹3856.71Cr",
    status: "unconfirmed",
    coords: { top: "65%", left: "8%", width: "38%", height: "10%" },
  },
  {
    name: "Net Income",
    value: "₹9416.36Cr",
    status: "unconfirmed",
    coords: { top: "35%", left: "55%", width: "38%", height: "10%" },
  },
  {
    name: "EPS",
    value: "₹194.06Cr",
    status: "unconfirmed",
    coords: { top: "48%", left: "55%", width: "38%", height: "10%" },
  },
  {
    name: "Operating Margin",
    value: "₹4272.81Cr",
    status: "unconfirmed",
    coords: { top: "10%", left: "10%", width: "80%", height: "80%" },
  },
  {
    name: "Net Margin",
    value: "₹8560.71Cr",
    status: "unconfirmed",
    coords: { top: "61%", left: "55%", width: "38%", height: "10%" },
  },
]

const metricTemplates = [
  { id: "T1", name: "FY25 Q1 Standard" },
  { id: "T2", name: "SaaS Growth Metrics" },
]

// --- MAIN COMPONENT ---
export default function FinancialDashboard() {
  // Dynamic quarters state
  const [quarters, setQuarters] = useState<Quarter[]>([])

  const [companies, setCompanies] = useState<Company[]>(initialCompanies)
  const [metrics, setMetrics] = useState<Metric[]>(initialMetrics)
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null)
  const [isSheetOpen, setIsSheetOpen] = useState(false)
  const [sheetMode, setSheetMode] = useState<"verify" | "viewReport">("verify")
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null)

  // Companies for latest quarter
  const [topCompanies, setTopCompanies] = useState<CompanyStatusItem[]>([])

  // Fetch quarters on mount
  useEffect(() => {
    async function fetchQuarters() {
      try {
        const res = await fetch("/api/quarters")
        const data = await res.json()
        setQuarters(data.quarters as Quarter[])
      } catch (err) {
        console.error("Failed to load quarters", err)
      }
    }

    fetchQuarters()
  }, [])

  const latestQuarter = quarters[0]
  const previousQuarters = quarters.slice(1)

  // Fetch companies whenever latestQuarter changes
  useEffect(() => {
    if (!latestQuarter) return

    async function fetchCompanies() {
      try {
        const res = await fetch(`/api/quarters/${latestQuarter.slug}/companies`)
        const data = await res.json()
        setTopCompanies(data.companies as CompanyStatusItem[])
      } catch (err) {
        console.error("Failed to load companies", err)
      }
    }

    fetchCompanies()
  }, [latestQuarter])

  const handleTemplateChange = (companyId: string, templateId: string | null) => {
    setCompanies(companies.map((c) => (c.id === companyId ? { ...c, template: templateId } : c)))
  }

  const handleRunExtraction = (company: Company) => {
    setSelectedCompany(company)
    setMetrics(initialMetrics.map((m) => ({ ...m, status: "unconfirmed" }))) // Reset metrics
    setSelectedMetric(null)
    setSheetMode("verify")
    setIsSheetOpen(true)
  }

  const handleViewReport = (company: Company) => {
    setSelectedCompany(company)
    setSheetMode("viewReport")
    setIsSheetOpen(true)
  }

  const handleMetricStatusChange = (metricName: string, newStatus: "verified" | "rejected") => {
    setMetrics(metrics.map((m) => (m.name === metricName ? { ...m, status: newStatus } : m)))
  }

  return (
    <div className="bg-gray-50 min-h-screen font-sans p-4 sm:p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Financial Metric Extraction</h1>
        <p className="text-gray-600 mt-1">Select a quarter to begin processing company reports.</p>
      </header>

      {/* Latest Quarter Card */}
      {latestQuarter && (
        <Link href={`/quarter/${latestQuarter.slug}`} className="group block">
          <Card className="hover:shadow-xl hover:border-primary transition-all duration-300 ease-in-out">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-2xl font-bold text-primary">{latestQuarter.title}</CardTitle>
                  <CardDescription>{latestQuarter.description}</CardDescription>
                </div>
                <ChevronRight className="h-7 w-7 text-gray-400 group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </div>
            </CardHeader>
            <CardContent>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Company Report Status</h3>
              <CompanyStatusList companies={topCompanies} />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Previous Quarters Section */}
      <div className="mt-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Previous Quarters</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {previousQuarters.map((quarter) => (
            <Link href={`/quarter/${quarter.slug}`} key={quarter.slug} className="group block">
              <Card className="hover:shadow-md hover:border-gray-300 transition-all duration-200">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-lg">{quarter.title}</CardTitle>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-gray-600 transition-colors" />
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

// --- SUB-COMPONENTS ---

const MetricTemplateSelector: FC<{
  selectedTemplate: string | null
  onSelect: (templateId: string | null) => void
}> = ({ selectedTemplate, onSelect }) => {
  const [templates, setTemplates] = useState<string[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const loadTemplates = async () => {
    try {
      const res = await fetch("/api/metric-templates")
      const data = await res.json()
      setTemplates(data.templates as string[])
    } catch (err) {
      console.error("Failed to load metric templates", err)
    }
  }

  useEffect(() => {
    loadTemplates()
  }, [])

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
        <SelectContent>
          <SelectItem value="none">None</SelectItem>
          {templates.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
          <SelectSeparator />
          <DialogTrigger asChild value="add_new">
            <div className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent focus:bg-accent">
              <Plus className="h-4 w-4 mr-2" />
              Add New Template
            </div>
          </DialogTrigger>
        </SelectContent>
      </Select>
      <MetricTemplateModal onSaved={loadTemplates} onClose={() => setIsDialogOpen(false)} />
    </Dialog>
  )
}

interface MetricTemplateModalProps {
  onSaved: () => void
  onClose: () => void
}

const MetricTemplateModal: FC<MetricTemplateModalProps> = ({ onSaved, onClose }) => {
  const [templateName, setTemplateName] = useState("")
  const [rows, setRows] = useState<{ metric: string; custom_instruction: string }[]>([
    { metric: "", custom_instruction: "" },
  ])

  const addRow = () => setRows([...rows, { metric: "", custom_instruction: "" }])

  const updateRow = (index: number, field: "metric" | "custom_instruction", value: string) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  const saveTemplate = async () => {
    if (!templateName.trim()) return
    try {
      await fetch("/api/metric-templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: templateName.trim(), metrics: rows }),
      })
      onSaved()
      onClose()
    } catch (err) {
      console.error("Failed to save template", err)
    }
  }

  return (
    <DialogContent className="sm:max-w-[700px]">
      <DialogHeader>
        <DialogTitle>Create Metric Template</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <Input placeholder="Template Name" value={templateName} onChange={(e) => setTemplateName(e.target.value)} />

        <div className="max-h-[60vh] overflow-y-auto -mx-6 px-6">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10">
              <TableRow>
                <TableHead>Metric Name</TableHead>
                <TableHead>Extraction Instruction</TableHead>
                <TableHead>
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>
                    <Input value={row.metric} onChange={(e) => updateRow(index, "metric", e.target.value)} />
                  </TableCell>
                  <TableCell>
                    <Input
                      value={row.custom_instruction}
                      onChange={(e) => updateRow(index, "custom_instruction", e.target.value)}
                    />
                  </TableCell>
                  <TableCell>
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
        <Button onClick={saveTemplate}>Save Template</Button>
      </DialogFooter>
    </DialogContent>
  )
}

const CompanyStatusList: FC<{ companies: CompanyStatusItem[] }> = ({ companies }) => (
  <div className="bg-gray-50/50 rounded-lg p-4 border">
    <ul className="space-y-3">
      {companies.map((company) => (
        <li key={company.id} className="flex items-center justify-between text-sm">
          <span className="text-gray-700">{company.name}</span>
          {company.reportFetched ? (
            <div className="flex items-center gap-2 text-green-600 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              <span>Fetched</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-amber-600 font-medium">
              <Clock className="h-4 w-4" />
              <span>Awaiting</span>
            </div>
          )}
        </li>
      ))}
    </ul>
  </div>
)
