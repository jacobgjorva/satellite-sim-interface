'use client'

import { useEffect, useState } from 'react'

interface ConnectionMessage {
  type: 'connection'
  message: string
  status: 'connected'
}

interface SatellitePosition {
  name: string
  norad: number
  lat: number
  lon: number
  alt: number | string
}

type WebSocketMessage = ConnectionMessage | SatellitePosition

function isSatellitePosition(msg: WebSocketMessage): msg is SatellitePosition {
  return 'norad' in msg
}

function isConnectionMessage(msg: WebSocketMessage): msg is ConnectionMessage {
  return 'type' in msg && msg.type === 'connection'
}

interface SatelliteData {
  name: string
  norad: number
  lat: number
  lon: number
  alt: number
  timestamp: Date
}

export default function Home() {
  const [satellites, setSatellites] = useState<Map<number, SatelliteData>>(new Map())
  const [connected, setConnected] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<string>('Disconnected')
  const [messageCount, setMessageCount] = useState(0)
  const [lastMessageTime, setLastMessageTime] = useState<Date | null>(null)

  useEffect(() => {
    let ws: WebSocket | null = null
    let reconnectTimeout: NodeJS.Timeout | null = null
    let isMounted = true

    const connect = () => {
      try {
        ws = new WebSocket('ws://localhost:8000/ws/satellites/live/')

        ws.onopen = () => {
          if (!isMounted) return
          console.log('Connected to satellite feed')
          setConnected(true)
          setConnectionStatus('Connected')
          if (reconnectTimeout) {
            clearTimeout(reconnectTimeout)
            reconnectTimeout = null
          }
        }

        ws.onmessage = (event) => {
          if (!isMounted) return
          try {
            setMessageCount(prev => {
              const newCount = prev + 1
              // Only log first few satellite updates to avoid console spam
              if (newCount <= 3) {
                console.log(`Received message #${newCount}`)
              }
              return newCount
            })
            setLastMessageTime(new Date())
            
            const data: WebSocketMessage = JSON.parse(event.data)

            // Handle connection message
            if (isConnectionMessage(data)) {
              console.log('Connection status:', data.status)
              setConnectionStatus(data.message)
              return
            }

            // Handle satellite position update
            if (isSatellitePosition(data)) {
              // Handle alt as string with "km" suffix if needed
              let altValue: number
              if (typeof data.alt === 'string') {
                altValue = parseFloat(data.alt.replace('km', '').trim())
              } else {
                altValue = data.alt
              }

              const satelliteData: SatelliteData = {
                name: data.name,
                norad: data.norad,
                lat: data.lat,
                lon: data.lon,
                alt: altValue,
                timestamp: new Date()
              }

              setSatellites(prev => {
                const updated = new Map(prev)
                updated.set(data.norad, satelliteData)
                return updated
              })
            } else {
              console.warn('Unknown message format:', data)
            }
          } catch (error) {
            console.error('Error parsing WebSocket message:', error)
            console.error('Raw message was:', event.data)
          }
        }

        ws.onerror = (error) => {
          if (!isMounted) return
          console.error('WebSocket error:', error)
          setConnected(false)
          setConnectionStatus('Connection error - retrying...')
        }

        ws.onclose = (event) => {
          if (!isMounted) return
          console.log('Disconnected from satellite feed', event.code, event.reason)
          setConnected(false)
          setConnectionStatus('Disconnected - reconnecting...')
          
          // Reconnect after 3 seconds if component is still mounted
          if (isMounted && !reconnectTimeout) {
            reconnectTimeout = setTimeout(() => {
              if (isMounted) {
                console.log('Attempting to reconnect...')
                connect()
              }
            }, 3000)
          }
        }
      } catch (error) {
        console.error('Failed to create WebSocket:', error)
        if (isMounted) {
          setConnectionStatus('Failed to connect - retrying...')
          reconnectTimeout = setTimeout(() => {
            if (isMounted) {
              connect()
            }
          }, 3000)
        }
      }
    }

    connect()

    return () => {
      isMounted = false
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout)
      }
      if (ws) {
        ws.close()
      }
    }
  }, [])

  return (
    <main className="main">
      <div className="container">
        <h1>Satellite Sim Interface</h1>
        
        <div style={{ marginBottom: '20px', padding: '10px', backgroundColor: connected ? '#d4edda' : '#f8d7da', borderRadius: '5px' }}>
          <div><strong>Status:</strong> {connectionStatus}</div>
          {connected && (
            <div style={{ marginTop: '10px', fontSize: '0.9em' }}>
              <div>Messages received: {messageCount}</div>
              {lastMessageTime && (
                <div>Last message: {lastMessageTime.toLocaleTimeString()}</div>
              )}
            </div>
          )}
        </div>

        <div>
          <h2>Satellite Coordinates (Real-time)</h2>
          {satellites.size === 0 ? (
            <div style={{ padding: '20px', backgroundColor: '#fff3cd', borderRadius: '5px', border: '1px solid #ffc107' }}>
              <p><strong>Waiting for satellite data...</strong></p>
              {connected && messageCount > 0 && (
                <p style={{ fontSize: '0.9em', marginTop: '10px' }}>
                  Connected and received {messageCount} message(s), but no satellite position data yet.
                  <br />
                  Make sure the backend is sending satellite coordinates through the WebSocket.
                </p>
              )}
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {Array.from(satellites.values()).map(sat => (
                <div 
                  key={sat.norad} 
                  style={{ 
                    padding: '15px', 
                    border: '1px solid #ddd', 
                    borderRadius: '5px',
                    backgroundColor: '#f9f9f9'
                  }}
                >
                  <h3 style={{ marginTop: 0 }}>{sat.name}</h3>
                  <p><strong>NORAD ID:</strong> {sat.norad}</p>
                  <p><strong>Latitude:</strong> {sat.lat.toFixed(6)}°</p>
                  <p><strong>Longitude:</strong> {sat.lon.toFixed(6)}°</p>
                  <p><strong>Altitude:</strong> {sat.alt.toFixed(2)} km</p>
                  <p style={{ fontSize: '0.9em', color: '#666' }}>
                    <strong>Last update:</strong> {sat.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  )
}


