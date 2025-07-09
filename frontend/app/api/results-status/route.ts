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
  const quarter = url.searchParams.get("quarter") // e.g. "FY25 Q4"
  const company = url.searchParams.get("company") // e.g. "Tata Steel"
  const template = url.searchParams.get("template") // e.g. "IT"

  if (!quarter || !company || !template) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 })
  }

  const blobPath = `${quarter}/${company}/${template}/results.json`

  try {
    const client = BlobServiceClient.fromConnectionString(getConn())
    const container = client.getContainerClient(containerName)
    const blobClient = container.getBlobClient(blobPath)
    const exists = await blobClient.exists()

    return NextResponse.json({ exists })
  } catch (err) {
    console.error("Error checking results.json", err)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
} 