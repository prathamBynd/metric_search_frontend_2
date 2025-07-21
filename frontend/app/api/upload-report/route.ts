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

export async function DELETE(req: NextRequest) {
  let body: { blobPath?: string }
  try {
    body = await req.json()
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
  }
  const blobPath = body.blobPath?.trim()
  if (!blobPath) {
    return NextResponse.json({ error: "Missing blobPath" }, { status: 400 })
  }

  try {
    const service = BlobServiceClient.fromConnectionString(getConn())
    const container = service.getContainerClient(containerName)
    const decodedPath = decodeURIComponent(blobPath)
    const blobClient = container.getBlobClient(decodedPath)
    await blobClient.deleteIfExists()
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("delete failed", err)
    return NextResponse.json({ error: "delete failed" }, { status: 500 })
  }
} 