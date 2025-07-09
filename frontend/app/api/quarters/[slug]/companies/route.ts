import { NextResponse } from "next/server"
import { BlobServiceClient } from "@azure/storage-blob"

function slugToTitle(slug: string) {
  const match = slug.match(/fy(\d{2})-q(\d)/i)
  if (!match) return slug.replace(/-/g, " ")
  const fy = match[1]
  const q = match[2]
  return `FY${fy} Q${q}`.toUpperCase()
}

interface CompanyStatus {
  id: string
  name: string
  reportFetched: boolean
  reportUrl?: string
}

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const quarterTitle = slugToTitle(slug)

  const connectionString =
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    "DefaultEndpointsProtocol=https;AccountName=byndpdfstorage;AccountKey=W+MtslPRTAm7uLuOaNWtHAz+WHq3uyMG7FWDggGrEvAfZaQWAzCQIMTbfLrGyO6cjjbEN9zfFft0+ASttSkisw==;EndpointSuffix=core.windows.net"
  const containerName = "metric-workflow"

  try {
    const serviceClient = BlobServiceClient.fromConnectionString(connectionString)
    const containerClient = serviceClient.getContainerClient(containerName)

    const companySet: Set<string> = new Set()

    const prefix = `${quarterTitle}/`

    // Collect company folder names
    for await (const item of containerClient.listBlobsByHierarchy("/", { prefix })) {
      if (item.kind === "prefix") {
        const fullPath = item.name // e.g., "FY24 Q4/Infosys/"
        const remainder = fullPath.slice(prefix.length).replace(/\/$/, "")
        if (remainder && !remainder.includes("/")) {
          companySet.add(remainder)
        }
      }
    }

    const companies = Array.from(companySet)

    // Determine fetched status in parallel
    const companyStatuses: CompanyStatus[] = await Promise.all(
      companies.map(async (company) => {
        const companyPrefix = `${prefix}${company}/`

        // Look for any PDF inside this company folder (non-recursive)
        let reportFetched = false
        let reportUrl: string | undefined = undefined
        for await (const blob of containerClient.listBlobsFlat({ prefix: companyPrefix })) {
          if (!blob.name.toLowerCase().endsWith(".pdf")) continue
          const remainder = blob.name.slice(companyPrefix.length)
          // Skip PDFs in nested subfolders (they will contain a '/').
          if (remainder.includes("/")) continue
          reportFetched = true
          reportUrl = `https://byndpdfstorage.blob.core.windows.net/${containerName}/${encodeURIComponent(blob.name)}`
          break
        }

        return {
          id: company.toLowerCase().replace(/\s+/g, "-"),
          name: company,
          reportFetched,
          reportUrl,
        }
      }),
    )

    return NextResponse.json({ companies: companyStatuses })
  } catch (err) {
    console.error("Error fetching companies from Azure Blob Storage:", err)
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 })
  }
} 