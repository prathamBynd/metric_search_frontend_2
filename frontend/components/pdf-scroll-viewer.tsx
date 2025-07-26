'use client'

import { useEffect, useRef, useState, useLayoutEffect } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/TextLayer.css"
import "react-pdf/dist/Page/AnnotationLayer.css"

// -------------------------------------------------------------------
// Configuration
// -------------------------------------------------------------------
// Amount of extra space (in screen pixels) to add around citation highlights
const PADDING = 4

// -------------------------------------------------------------------
// Type helpers
// -------------------------------------------------------------------
/**
 * Bounding-box information in the coordinate system returned by the backend
 * (Fitz / PDF "user space"; origin bottom-left, units = points).
 */
export interface PdfHighlight {
  /** 1-based page number that should be highlighted */
  page: number
  /** Rectangle [x1, y1, x2, y2] in PDF points */
  coords: number[]
}

// Configure the worker – react-pdf requires a workerSrc.
// Use cdnjs CDN over HTTPS to serve the worker script. The explicit protocol
// avoids issues where the browser rejects scheme–relative URLs when running on
// localhost with "http". If you prefer a fully local worker, copy
// "node_modules/pdfjs-dist/build/pdf.worker.min.js" into your /public folder
// and set workerSrc to "/pdf.worker.min.js" instead.
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.js"

interface PdfScrollViewerProps {
  /** Absolute or relative URL of the PDF file */
  fileUrl: string
  /** 1-based page index that should be scrolled into view. Pass null to keep current position. */
  targetPage: number | null
  /** A number that forces re-scroll even if targetPage hasn’t changed (increment on each click). */
  scrollSignal?: number
  /** Optional: container class names to style the outer wrapper */
  className?: string
  /** Optional highlight to draw. Pass `null` (default) for none. */
  highlight?: PdfHighlight | null
}

/**
 * PdfScrollViewer
 *  – Lightweight wrapper around react-pdf that renders **all** pages once
 *    and exposes an imperative "scroll to page" behaviour.
 *  – For production scale PDFs (>50 pages) you might want virtualisation,
 *    but for typical quarterly/annual reports (~10-20 pages) this approach is fine.
 */
export default function PdfScrollViewer({ fileUrl, targetPage, className, scrollSignal, highlight }: PdfScrollViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  // Track container width to size each rendered page responsively
  const [pageWidth, setPageWidth] = useState<number | undefined>(undefined)

  // Observe width changes (handles window resize and first mount)
  useLayoutEffect(() => {
    const el = containerRef.current
    if (!el) return

    const update = () => setPageWidth(el.clientWidth)
    update()

    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Save refs for each rendered page so we can call scrollIntoView.
  const pageRefs = useRef<(HTMLDivElement | null)[]>([])

  // Keep refs to the loaded PDF pages so that we can compute viewport
  const pageProxies = useRef<(pdfjs.PDFPageProxy | null)[]>([])

  // Track latest container width (page width) so recalculations happen on resize
  const latestPageWidthRef = useRef<number | undefined>(undefined)

  const [numPages, setNumPages] = useState<number | null>(null)

  // Imperative helper to scroll to the desired page **after** it is rendered.
  const scrollToTarget = () => {
    if (targetPage == null || numPages == null) return
    // targetPage is guaranteed to be non-null at this point
    const pageIdx = targetPage! - 1
    const el = pageRefs.current[pageIdx]
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  // When the desired page number or the total pages change, attempt a scroll.
  // If the canvas is not yet rendered (height === 0), we'll re-try shortly.
  useEffect(() => {
    if (targetPage == null || targetPage <= 0 || numPages == null) return

    let attempts = 0
    const maxAttempts = 10
    const retryDelay = 150 // ms

    function tryScroll() {
      const pageIdx = targetPage! - 1
      const el = pageRefs.current[pageIdx]
      // If the element exists & has height, scroll; otherwise retry a few times.
      if (el && el.offsetHeight > 0) {
        el.scrollIntoView({ behavior: "smooth", block: "start" })
      } else if (attempts < maxAttempts) {
        attempts += 1
        setTimeout(tryScroll, retryDelay)
      }
    }

    tryScroll()
    // No cleanup needed because setTimeout is self-terminating.
  }, [targetPage, numPages, scrollSignal])

  // Cache highlight <div> styles per page (keyed by page number)
  const [highlightStyles, setHighlightStyles] = useState<Record<number, React.CSSProperties>>({})

  const updateHighlightStyle = (page: number, style: React.CSSProperties) => {
    // Replace existing styles, only keep the active page's highlight
    setHighlightStyles({ [page]: style })
  }

  // Recompute highlight whenever the highlight prop or page width changes
  useEffect(() => {
    if (!highlight) {
      setHighlightStyles({})
      return
    }
    const idx = highlight.page - 1
    const pdfPage = pageProxies.current[idx]
    const width = latestPageWidthRef.current ?? pageWidth
    if (!pdfPage || !width) return

    const scale = width / pdfPage.view[2]
    const viewport = pdfPage.getViewport({ scale })

    const [hx0, hy0, hx1, hy1] = highlight.coords as [number, number, number, number]
    const pageHeight = pdfPage.view[3] // height in user-space units
    // Fitz coords: y increases downward. Convert to PDF user-space where y increases upward.
    const pdfRect: [number, number, number, number] = [hx0, pageHeight - hy1, hx1, pageHeight - hy0]

    const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(pdfRect)

    updateHighlightStyle(highlight.page, {
      position: "absolute",
      pointerEvents: "none",
      border: "2px solid rgba(0,128,255,0.9)",
      backgroundColor: "rgba(0,128,255,0.25)",
      left: Math.min(vx1, vx2) - PADDING,
      top: Math.min(vy1, vy2) - PADDING,
      width: Math.abs(vx1 - vx2) + PADDING * 2,
      height: Math.abs(vy1 - vy2) + PADDING * 2,
    })
  }, [highlight, pageWidth])

  return (
    <div
      ref={containerRef}
      // Fill the parent container completely and allow vertical scrolling
      className={className ?? "absolute inset-0 overflow-y-auto bg-white"}
    >
      <Document
        file={fileUrl}
        onLoadSuccess={(doc: pdfjs.PDFDocumentProxy) => setNumPages(doc.numPages)}
      >
        {Array.from({ length: numPages ?? 0 }).map((_, idx) => (
          <div
            key={idx}
            ref={(el) => {
              pageRefs.current[idx] = el
            }}
            className="flex justify-center py-2"
          >
            {/* We wrap the Page in a relative container so that the absolutely-
                positioned highlight <div> lines up regardless of flex centering. */}
            <div style={{ position: "relative" }}>
              <Page
                pageNumber={idx + 1}
                width={pageWidth}
                onLoadSuccess={(pdfPage) => {
                  // Save reference
                  pageProxies.current[idx] = pdfPage
                  latestPageWidthRef.current = pageWidth
                  /* Compute highlight rectangle once the page geometry is known */
                  if (highlight && highlight.page === idx + 1 && pageWidth) {
                    const scale = pageWidth / pdfPage.view[2] /* pdfPage.view[2] = width */
                    const viewport = pdfPage.getViewport({ scale })

                    const [hx0, hy0, hx1, hy1] = highlight.coords as [number, number, number, number]
                    const pageHeight = pdfPage.view[3]
                    const pdfRect: [number, number, number, number] = [hx0, pageHeight - hy1, hx1, pageHeight - hy0]
                    const [vx1, vy1, vx2, vy2] = viewport.convertToViewportRectangle(pdfRect)

                    updateHighlightStyle(idx + 1, {
                      position: "absolute",
                      pointerEvents: "none",
                      border: "2px solid rgba(0,128,255,0.9)",
                      backgroundColor: "rgba(0,128,255,0.25)",
                      left: Math.min(vx1, vx2) - PADDING,
                      top: Math.min(vy1, vy2) - PADDING,
                      width: Math.abs(vx1 - vx2) + PADDING * 2,
                      height: Math.abs(vy1 - vy2) + PADDING * 2,
                    })
                  }

                  // If this is the target page, scroll after it renders
                  if (targetPage != null && targetPage === idx + 1) {
                    scrollToTarget()
                  }
                }}
                onRenderSuccess={() => {
                  // Also scroll when render completes (covers refs when width changes)
                  if (targetPage != null && targetPage === idx + 1) {
                    scrollToTarget()
                  }
                }}
              />

              {/* Highlight overlay */}
              {highlight && highlight.page === idx + 1 && highlightStyles[highlight.page] && (
                <div style={highlightStyles[highlight.page]} />
              )}
            </div>
          </div>
        ))}
      </Document>
    </div>
  )
}

// -------------------------------------------------------------------
// Recompute highlight when props change (runs outside of JSX for clarity)
// -------------------------------------------------------------------
PdfScrollViewer.displayName = "PdfScrollViewer" 