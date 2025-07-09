import { NextResponse } from "next/server"
import { BlobServiceClient } from "@azure/storage-blob"

const containerName = "metric-workflow"

function getConn() {
  return (
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    "DefaultEndpointsProtocol=https;AccountName=byndpdfstorage;AccountKey=W+MtslPRTAm7uLuOaNWtHAz+WHq3uyMG7FWDggGrEvAfZaQWAzCQIMTbfLrGyO6cjjbEN9zfFft0+ASttSkisw==;EndpointSuffix=core.windows.net"
  )
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const quarter = url.searchParams.get("quarter")
  const company = url.searchParams.get("company")
  const template = url.searchParams.get("template")

  if (!quarter || !company || !template) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 })
  }

  const blobPath = `${quarter}/${company}/${template}/results.json`

  try {
    const client = BlobServiceClient.fromConnectionString(getConn())
    const container = client.getContainerClient(containerName)
    const blobClient = container.getBlobClient(blobPath)

    const download = await blobClient.download()
    const text = await streamToString((download.readableStreamBody as any) || null)
    const json = JSON.parse(text)

    return NextResponse.json(json)
  } catch (err) {
    console.error("Error fetching results.json", err)
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 })
  }
}

async function streamToString(readable: NodeJS.ReadableStream | null): Promise<string> {
  if (!readable) return ""
  const chunks: Uint8Array[] = []
  for await (const chunk of readable) {
    chunks.push(chunk as Uint8Array)
  }
  return Buffer.concat(chunks).toString("utf-8")
} 