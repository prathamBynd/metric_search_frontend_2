import { NextRequest, NextResponse } from "next/server"
import { BlobServiceClient } from "@azure/storage-blob"

const containerName = "metric-workflow"

function getConn() {
  return (
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    "DefaultEndpointsProtocol=https;AccountName=byndpdfstorage;AccountKey=W+MtslPRTAm7uLuOaNWtHAz+WHq3uyMG7FWDggGrEvAfZaQWAzCQIMTbfLrGyO6cjjbEN9zfFft0+ASttSkisw==;EndpointSuffix=core.windows.net"
  )
}

export async function POST(req: NextRequest) {
  const form = await req.formData()
  const file = form.get("file") as File | null
  const quarter = form.get("quarter") as string | null
  const company = form.get("company") as string | null
  if (!file || !quarter || !company) {
    return NextResponse.json({ error: "missing params" }, { status: 400 })
  }
  try {
    const service = BlobServiceClient.fromConnectionString(getConn())
    const container = service.getContainerClient(containerName)
    const blobName = `${quarter}/${company}/${file.name}`
    const block = container.getBlockBlobClient(blobName)
    const arrayBuffer = await file.arrayBuffer()
    await block.uploadData(Buffer.from(arrayBuffer), {
      blobHTTPHeaders: { blobContentType: "application/pdf" },
    })
    return NextResponse.json({ success: true, url: `https://byndpdfstorage.blob.core.windows.net/${containerName}/${encodeURIComponent(blobName)}` })
  } catch (err) {
    console.error("upload failed", err)
    return NextResponse.json({ error: "upload failed" }, { status: 500 })
  }
} 