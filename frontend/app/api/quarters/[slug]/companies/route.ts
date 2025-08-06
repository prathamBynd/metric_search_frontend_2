import { NextResponse } from "next/server"
import { BlobServiceClient } from "@azure/storage-blob"

function slugToTitle(slug: string) {
  const match = slug.match(/fy(\d{2})(?:-q(\d))?/i)
  if (!match) return slug.replace(/-/g, " ").toUpperCase()
  const fy = match[1]
  const q = match[2]
  return q ? `FY${fy} Q${q}`.toUpperCase() : `FY${fy}`.toUpperCase()
}

interface CompanyStatus {
  id: string
  name: string
  reportFetched: boolean
  reportUrls: string[]
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

        const urls: string[] = []
        for await (const blob of containerClient.listBlobsFlat({ prefix: companyPrefix })) {
          if (!blob.name.toLowerCase().endsWith(".pdf")) continue
          const remainder = blob.name.slice(companyPrefix.length)
          // Skip PDFs in nested subfolders
          if (remainder.includes("/")) continue
          const fullUrl = `https://byndpdfstorage.blob.core.windows.net/${containerName}/${encodeURIComponent(blob.name)}`
          urls.push(fullUrl)
        }

        return {
          id: company.toLowerCase().replace(/\s+/g, "-"),
          name: company,
          reportFetched: urls.length > 0,
          reportUrls: urls,
        }
      }),
    )

    return NextResponse.json({ companies: companyStatuses })
  } catch (err) {
    console.error("Error fetching companies from Azure Blob Storage:", err)
    return NextResponse.json({ error: "Failed to fetch companies" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const quarterTitle = slugToTitle(slug)

  let body: { company?: string }
  try {
    body = await request.json()
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }

  const companyName = body.company?.trim()
  if (!companyName) {
    return NextResponse.json({ error: "Missing company name" }, { status: 400 })
  }

  const connectionString =
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    "DefaultEndpointsProtocol=https;AccountName=byndpdfstorage;AccountKey=W+MtslPRTAm7uLuOaNWtHAz+WHq3uyMG7FWDggGrEvAfZaQWAzCQIMTbfLrGyO6cjjbEN9zfFft0+ASttSkisw==;EndpointSuffix=core.windows.net"
  const containerName = "metric-workflow"

  try {
    const serviceClient = BlobServiceClient.fromConnectionString(connectionString)
    const containerClient = serviceClient.getContainerClient(containerName)

    const prefix = `${quarterTitle}/${companyName}/`

    // Delete all blobs under the prefix (company folder)
    const deletePromises: Promise<any>[] = []
    for await (const blob of containerClient.listBlobsFlat({ prefix })) {
      const blobClient = containerClient.getBlobClient(blob.name)
      deletePromises.push(blobClient.deleteIfExists())
    }

    await Promise.all(deletePromises)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Error deleting company blobs:", err)
    return NextResponse.json({ error: "Failed to delete company" }, { status: 500 })
  }
} 