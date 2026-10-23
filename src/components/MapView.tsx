import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, LayerGroup } from 'leaflet'

export interface MapMarker {
  id: string
  lat: number
  lng: number
  label: string
  tone?: 'primary' | 'good' | 'wait' | 'neutral' | 'start'
  number?: number
}

interface Props {
  markers: MapMarker[]
  /** Ordered points drawn as a route line. */
  line?: Array<[number, number]>
  /** Circles around markers, in metres (customer geofences). */
  radiusM?: Record<string, number>
  onPick?: (lat: number, lng: number) => void
  height?: number
  label: string
}

const PHNOM_PENH: [number, number] = [11.5564, 104.9282]

const COLORS: Record<NonNullable<MapMarker['tone']>, string> = {
  primary: '#1f6f6b',
  good: '#2e8b5e',
  wait: '#d99a1c',
  neutral: '#6b7f7e',
  start: '#17302f',
}

/**
 * Leaflet map on OpenStreetMap tiles, loaded in the browser only. Markers are drawn as
 * numbered dots, so no image files are needed.
 */
export function MapView({ markers, line, radiusM, onPick, height = 280, label }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const layer = useRef<LayerGroup | null>(null)
  const pick = useRef(onPick)
  pick.current = onPick
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let dead = false
    void import('leaflet').then((L) => {
      if (dead || !el.current || map.current) return
      const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(PHNOM_PENH, 12)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(m)
      m.on('click', (e) => pick.current?.(e.latlng.lat, e.latlng.lng))
      map.current = m
      layer.current = L.layerGroup().addTo(m)
      setReady(true)
    })
    return () => {
      dead = true
      map.current?.remove()
      map.current = null
      layer.current = null
    }
  }, [])

  useEffect(() => {
    if (!ready || !map.current || !layer.current) return
    const group = layer.current
    const m = map.current
    void import('leaflet').then((L) => {
      group.clearLayers()
      const bounds: Array<[number, number]> = []
      if (line && line.length > 1) {
        L.polyline(line, { color: COLORS.primary, weight: 3, opacity: 0.7, dashArray: '6 6' }).addTo(group)
      }
      for (const mk of markers) {
        const color = COLORS[mk.tone ?? 'primary']
        const icon = L.divIcon({
          className: '',
          iconSize: [26, 26],
          iconAnchor: [13, 13],
          html: `<div style="width:26px;height:26px;border-radius:999px;background:${color};color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font:600 12px Inter,system-ui,sans-serif">${mk.number ?? ''}</div>`,
        })
        const marker = L.marker([mk.lat, mk.lng], { icon, title: mk.label, alt: mk.label }).addTo(group)
        marker.bindTooltip(mk.label)
        const r = radiusM?.[mk.id]
        if (r) L.circle([mk.lat, mk.lng], { radius: r, color, weight: 1, fillOpacity: 0.08 }).addTo(group)
        bounds.push([mk.lat, mk.lng])
      }
      if (bounds.length > 1) m.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 })
      else if (bounds.length === 1) m.setView(bounds[0], 15)
      m.invalidateSize()
    })
  }, [ready, markers, line, radiusM])

  return (
    <div
      ref={el}
      role="region"
      aria-label={label}
      data-testid="map"
      data-ready={ready}
      data-markers={markers.length}
      style={{ height }}
      className="z-0 w-full overflow-hidden rounded-lg border bg-muted"
    />
  )
}
