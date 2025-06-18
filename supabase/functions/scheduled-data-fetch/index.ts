// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

console.log("Scheduled data fetch function started")

const NEXT_API_URL = Deno.env.get("NEXT_API_URL") || "https://pyugwrdtgx8rrkgt.live.co.dev"
const CRON_SECRET = Deno.env.get('CRON_SECRET')

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = new Date()
  console.log(`\n=== SUPABASE CRON FUNCTION TRIGGERED ===`)
  console.log(`[SUPABASE-CRON] ${startTime.toISOString()} - Scheduled data fetch function triggered`)
  console.log(`[SUPABASE-CRON] Request method: ${req.method}`)
  console.log(`[SUPABASE-CRON] Request URL: ${req.url}`)
  console.log(`[SUPABASE-CRON] Environment check - NEXT_API_URL: ${NEXT_API_URL}`)
  console.log(`[SUPABASE-CRON] Environment check - CRON_SECRET exists: ${!!CRON_SECRET}`)
  console.log(`=== END SUPABASE CRON HEADER ===\n`)

  try {
    if (!CRON_SECRET) {
      const errorMsg = "CRON_SECRET environment variable is not set"
      console.error(`[SUPABASE-CRON] CRITICAL ERROR: ${errorMsg}`)
      throw new Error(errorMsg)
    }

    const targetUrl = `${NEXT_API_URL}/api/data-scheduling/cron-trigger`
    console.log(`[SUPABASE-CRON] STEP 1: Preparing to call cron-trigger endpoint: ${targetUrl}`)
    console.log(`[SUPABASE-CRON] STEP 1: Request headers will include:`, {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer [REDACTED]',
      'x-supabase-cron': 'true'
    })
    console.log(`[SUPABASE-CRON] STEP 1: Request body will be:`, {
      source: "supabase-cron",
      timestamp: startTime.toISOString(),
      force: false
    })
    
    // Call the existing cron-trigger API endpoint with increased timeout
    // Use AbortController to handle timeout gracefully
    console.log(`[SUPABASE-CRON] STEP 2: Setting up fetch request with 30 second timeout`)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      console.log(`[SUPABASE-CRON] TIMEOUT: Request timed out after 30 seconds`)
      controller.abort()
    }, 30000) // 30 second timeout
    
    console.log(`[SUPABASE-CRON] STEP 3: Making fetch request to ${targetUrl}`)
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CRON_SECRET}`,
        'x-supabase-cron': 'true'
      },
      body: JSON.stringify({
        source: "supabase-cron",
        timestamp: startTime.toISOString(),
        force: false // Let the scheduling logic determine if it should run
      }),
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    console.log(`[SUPABASE-CRON] STEP 4: Fetch request completed with status: ${response.status}`)
    console.log(`[SUPABASE-CRON] STEP 4: Response headers:`, Object.fromEntries(response.headers.entries()))

    let result
    try {
      console.log(`[SUPABASE-CRON] STEP 5: Reading response text`)
      result = await response.text()
      console.log(`[SUPABASE-CRON] STEP 5: Response text length: ${result.length}`)
      console.log(`[SUPABASE-CRON] STEP 5: Response content:`, result)
    } catch (textError) {
      console.error(`[SUPABASE-CRON] STEP 5: Error reading response text:`, textError)
      result = `Error reading response: ${textError.message}`
    }

    const endTime = new Date()
    const duration = endTime.getTime() - startTime.getTime()

    console.log(`[SUPABASE-CRON] Completed in ${duration}ms with status ${response.status}`)

    return new Response(
      JSON.stringify({
        success: response.ok,
        message: "Scheduled data fetch triggered",
        status: response.status,
        duration: `${duration}ms`,
        timestamp: startTime.toISOString(),
        result: result,
        apiUrl: NEXT_API_URL
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    )
  } catch (error) {
    const endTime = new Date()
    const duration = endTime.getTime() - startTime.getTime()
    
    console.error(`[SUPABASE-CRON] Error in scheduled data fetch (${duration}ms):`, error)
    
    // Check if it's an abort error (timeout)
    if (error.name === 'AbortError') {
      console.log(`[SUPABASE-CRON] Request timed out after 30 seconds - this is expected for long-running processes`)
      return new Response(
        JSON.stringify({
          success: true, // Consider timeout as success since the process was initiated
          message: "Scheduled data fetch initiated (timed out waiting for completion, but process continues)",
          timeout: true,
          duration: `${duration}ms`,
          timestamp: startTime.toISOString()
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        },
      )
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "An error occurred during scheduled data fetch",
        duration: `${duration}ms`,
        timestamp: startTime.toISOString(),
        error: error.name || "UnknownError"
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    )
  }
})