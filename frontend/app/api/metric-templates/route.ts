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

export async function POST(req: Request) {
  try {
    const service = BlobServiceClient.fromConnectionString(getConnectionString())
    const container = service.getContainerClient(containerName)

    // Expect multipart/form-data with fields: name (string), metrics (json string), excel (file)
    const form = await req.formData()
    const name = String(form.get("name") || "").trim()
    const metricsRaw = String(form.get("metrics") || "")
    const excel = form.get("excel") as File | null

    if (!name) {
      return NextResponse.json({ error: "Missing template name" }, { status: 400 })
    }
    let metrics: { metric: string; custom_instruction: string; docUrl?: string; pdf_blob_url?: string; sheet_name?: string }[]
    try {
      metrics = JSON.parse(metricsRaw || "[]")
    } catch (e) {
      return NextResponse.json({ error: "Invalid metrics JSON" }, { status: 400 })
    }
    if (!Array.isArray(metrics) || metrics.length === 0) {
      return NextResponse.json({ error: "Metrics are required" }, { status: 400 })
    }

    const jsonBlobName = `${folderPrefix}${name}.json`

    // If excel not provided, try to keep existing excel_url (for edits)
    let excelUrlToPersist: string | null = null
    if (!excel) {
      try {
        const existingBlob = container.getBlobClient(jsonBlobName)
        const existingDownload = await existingBlob.download()
        const text = await streamToString((existingDownload.readableStreamBody as any) || null)
        const existing = JSON.parse(text)
        if (existing && typeof existing.excel_url === "string") {
          excelUrlToPersist = existing.excel_url
        }
      } catch (e) {
        // no existing file; for create without excel, this is invalid
      }
    }

    let finalExcelUrl = excelUrlToPersist
    if (excel) {
      const arrayBuffer = await excel.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const originalName = (excel as any).name || "template.xlsx"
      const extMatch = /\.[A-Za-z0-9]+$/.exec(originalName)
      const ext = extMatch ? extMatch[0] : ".xlsx"
      const excelBlobName = `${folderPrefix}${name}${ext}`
      const excelBlob = container.getBlockBlobClient(excelBlobName)
      await excelBlob.upload(buffer, buffer.byteLength, {
        blobHTTPHeaders: {
          blobContentType: excel.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
      })
      finalExcelUrl = `https://byndpdfstorage.blob.core.windows.net/${containerName}/${encodeURIComponent(excelBlobName)}`
    }

    if (!finalExcelUrl) {
      return NextResponse.json({ error: "Excel file is required for new templates" }, { status: 400 })
    }

    // Map per-metric docUrl into legacy-compatible key in case consumers expect pdf_blob_url
    const metricsWithDoc = metrics.map((m) => ({
      metric: m.metric,
      custom_instruction: m.custom_instruction,
      pdf_blob_url: m.pdf_blob_url || m.docUrl || "",
      sheet_name: m.sheet_name || "",
    }))

    const contentObject = {
      excel_url: finalExcelUrl,
      metrics: metricsWithDoc,
    }

    const jsonContent = JSON.stringify(contentObject, null, 2)
    const jsonBlob = container.getBlockBlobClient(jsonBlobName)
    await jsonBlob.upload(jsonContent, Buffer.byteLength(jsonContent), {
      blobHTTPHeaders: { blobContentType: "application/json" },
      onProgress: undefined,
    })

    return NextResponse.json({ success: true, excel_url: finalExcelUrl })
  } catch (err) {
    console.error("Error saving metric template", err)
    return NextResponse.json({ error: "Failed to save template" }, { status: 500 })
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