import { NextResponse } from "next/server"
import { BlobServiceClient } from "@azure/storage-blob"

interface Quarter {
  title: string
  slug: string
  description: string
}

function toSlug(title: string) {
  return title.toLowerCase().replace(/\s+/g, "-")
}

function getDescription(title: string) {
  // Accept "FY25" or "FY25 Q1"
  const match = title.match(/FY(\d{2})(?:\s*Q(\d))?/i)
  if (!match) return ""
  const year = match[1]
  const quarter = match[2]
  return quarter
    ? `Financial Year 20${year} - Quarter ${quarter}`
    : `Financial Year 20${year}`
}

function sortQuarters(q1: string, q2: string) {
  const parse = (q: string) => {
    const match = q.match(/FY(\d{2})(?:\s*Q(\d))?/i)
    if (!match) return { year: 0, quarter: 0 }
    return { year: parseInt(match[1], 10), quarter: match[2] ? parseInt(match[2], 10) : 0 }
  }
  const a = parse(q1)
  const b = parse(q2)
  if (a.year !== b.year) return b.year - a.year // latest year first
  return b.quarter - a.quarter // latest quarter first within same year
}

export async function GET() {
  const connectionString =
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    "DefaultEndpointsProtocol=https;AccountName=byndpdfstorage;AccountKey=W+MtslPRTAm7uLuOaNWtHAz+WHq3uyMG7FWDggGrEvAfZaQWAzCQIMTbfLrGyO6cjjbEN9zfFft0+ASttSkisw==;EndpointSuffix=core.windows.net"
  const containerName = "metric-workflow"

  try {
    const serviceClient = BlobServiceClient.fromConnectionString(connectionString)
    const containerClient = serviceClient.getContainerClient(containerName)

    const folderSet: Set<string> = new Set()

    // Using "/" delimiter to get virtual folders
    for await (const item of containerClient.listBlobsByHierarchy("/", { prefix: "" })) {
      if (item.kind === "prefix") {
        const folderName = item.name.replace(/\/$/, "")
        if (folderName) folderSet.add(folderName)
      }
    }

    const quarterNames = Array.from(folderSet)

    // Keep only folders that match the expected pattern and do not contain encoded chars
    const filtered = quarterNames
      .filter((name) => !name.includes("%"))
      // Accept "FY23" or "FY23 Q4"
      .filter((name) => /^FY\d{2}(?:\sQ\d)?$/i.test(name))

    filtered.sort(sortQuarters)

    const quarters: Quarter[] = filtered.map((title) => ({
      title,
      slug: toSlug(title),
      description: getDescription(title),
    }))

    return NextResponse.json({ quarters })
  } catch (err) {
    console.error("Error fetching quarters from Azure Blob Storage:", err)
    return NextResponse.json({ error: "Failed to fetch quarters" }, { status: 500 })
  }
} 