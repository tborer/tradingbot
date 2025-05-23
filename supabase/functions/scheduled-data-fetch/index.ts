// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

console.log("Scheduled data fetch function started")

const NEXT_API_URL = Deno.env.get("NEXT_API_URL") || "https://your-app-url.vercel.app"

serve(async (req) => {
  // This is needed if you're planning to invoke your function from a browser.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log("Triggering data fetch cron job")
    
    // Call the existing cron-trigger API endpoint
    const response = await fetch(`${NEXT_API_URL}/api/data-scheduling/cron-trigger`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${Deno.env.get('CRON_SECRET')}`,
        'x-supabase-cron': 'true'
      }
    })

    const result = await response.text()
    console.log("Cron job response:", result)

    return new Response(
      JSON.stringify({
        success: response.ok,
        message: "Scheduled data fetch triggered",
        status: response.status,
        result: result
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      },
    )
  } catch (error) {
    console.error("Error in scheduled data fetch:", error)
    
    return new Response(
      JSON.stringify({
        success: false,
        message: error.message || "An error occurred during scheduled data fetch",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    )
  }
})