import { NextResponse } from "next/server"
import { BlobServiceClient } from "@azure/storage-blob"

const containerName = "metric-workflow"
const folderPrefix = "metric_templates/"

function conn() {
  return (
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    "DefaultEndpointsProtocol=https;AccountName=byndpdfstorage;AccountKey=W+MtslPRTAm7uLuOaNWtHAz+WHq3uyMG7FWDggGrEvAfZaQWAzCQIMTbfLrGyO6cjjbEN9zfFft0+ASttSkisw==;EndpointSuffix=core.windows.net"
  )
}

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const blobName = `${folderPrefix}${name}.json`

  try {
    const service = BlobServiceClient.fromConnectionString(conn())
    const container = service.getContainerClient(containerName)
    const blockBlob = container.getBlobClient(blobName)
    const download = await blockBlob.download()
    const text = await streamToString((download.readableStreamBody as any) || null)
    const parsed = JSON.parse(text || "{}")
    const excel_url = typeof parsed?.excel_url === "string" ? parsed.excel_url : null
    const metrics = Array.isArray(parsed?.metrics) ? parsed.metrics : []
    return NextResponse.json({ excel_url, metrics })
  } catch (err) {
    console.error("Error reading metric template", err)
    return NextResponse.json({ error: "Failed to read template" }, { status: 500 })
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const blobName = `${folderPrefix}${name}.json`

  try {
    const service = BlobServiceClient.fromConnectionString(conn())
    const container = service.getContainerClient(containerName)

    const blobClient = container.getBlobClient(blobName)
    await blobClient.deleteIfExists()

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Error deleting metric template", err)
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 })
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