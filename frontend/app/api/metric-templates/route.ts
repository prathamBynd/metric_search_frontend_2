import { NextResponse } from "next/server"
import { BlobServiceClient } from "@azure/storage-blob"

const containerName = "metric-workflow"
const folderPrefix = "metric_templates/" // ensure trailing slash

function getConnectionString() {
  return (
    process.env.AZURE_STORAGE_CONNECTION_STRING ||
    "DefaultEndpointsProtocol=https;AccountName=byndpdfstorage;AccountKey=W+MtslPRTAm7uLuOaNWtHAz+WHq3uyMG7FWDggGrEvAfZaQWAzCQIMTbfLrGyO6cjjbEN9zfFft0+ASttSkisw==;EndpointSuffix=core.windows.net"
  )
}

export async function GET() {
  try {
    const service = BlobServiceClient.fromConnectionString(getConnectionString())
    const container = service.getContainerClient(containerName)

    const templateNames: string[] = []

    // List blobs directly under metric_templates/
    for await (const blob of container.listBlobsFlat({ prefix: folderPrefix })) {
      if (blob.name.endsWith(".json")) {
        const file = blob.name.substring(folderPrefix.length) // e.g. "IT.json"
        if (file && !file.includes("/")) {
          templateNames.push(file.replace(/\.json$/i, ""))
        }
      }
    }

    return NextResponse.json({ templates: templateNames })
  } catch (err) {
    console.error("Error listing metric templates", err)
    return NextResponse.json({ error: "Failed to list templates" }, { status: 500 })
  }
}

interface SavePayload {
  name: string // template name (file name without extension)
  metrics: { metric: string; custom_instruction: string }[]
}

export async function POST(req: Request) {
  try {
    const payload: SavePayload = await req.json()
    if (!payload.name || !payload.metrics?.length) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    const fileName = `${folderPrefix}${payload.name}.json`

    const service = BlobServiceClient.fromConnectionString(getConnectionString())
    const container = service.getContainerClient(containerName)

    const blockBlob = container.getBlockBlobClient(fileName)

    const content = JSON.stringify(payload.metrics, null, 2)

    await blockBlob.upload(content, Buffer.byteLength(content), {
      blobHTTPHeaders: { blobContentType: "application/json" },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("Error saving metric template", err)
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 })
  }
} 