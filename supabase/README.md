# Supabase Cron Jobs

This directory contains Supabase Edge Functions that are configured to run on a schedule.

## Scheduled Data Fetch

The `scheduled-data-fetch` function is configured to run every 15 minutes for testing (production should be daily at 11:45 PM). It triggers the application's data fetching and analysis process by calling the `/api/data-scheduling/cron-trigger` endpoint.

### Current Configuration

- **Schedule**: `*/15 * * * *` (every 15 minutes for testing)
- **Production Schedule**: `45 23 * * *` (daily at 11:45 PM UTC)
- **Timeout**: 30 seconds (handles long-running processes gracefully)
- **API URL**: https://pyugwrdtgx8rrkgt.live.co.dev
- **Authentication**: Bearer token with CRON_SECRET

### Deployment

To deploy the cron job to your Supabase project:

1. Make sure you have the Supabase CLI installed:
   ```
   npm install -g supabase
   ```

2. Login to Supabase:
   ```
   supabase login
   ```

3. Link your project (if not already linked):
   ```
   supabase link --project-ref your-project-ref
   ```

4. Set the required environment variables:
   ```
   supabase secrets set NEXT_API_URL=https://pyugwrdtgx8rrkgt.live.co.dev
   supabase secrets set CRON_SECRET=451c4bf2-9fae-4c13-a620-ee3d7875017f
   ```

5. Deploy the functions:
   ```
   supabase functions deploy scheduled-data-fetch
   ```

### Verification

To verify that your cron job is properly configured:

1. Go to the Supabase dashboard
2. Navigate to Edge Functions
3. Check that the `scheduled-data-fetch` function is listed with a cron schedule
4. Check the function logs to see if it's being triggered correctly

### Troubleshooting

#### Debug Endpoints
- `/api/debug/cron-logs` - View recent cron activity and logs
- `/api/debug/test-cron` - Manually trigger a test cron run

#### Manual Testing

Test the function directly:
```
supabase functions invoke scheduled-data-fetch
```

Test the API endpoint directly:
```bash
curl -X POST https://pyugwrdtgx8rrkgt.live.co.dev/api/data-scheduling/cron-trigger \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 451c4bf2-9fae-4c13-a620-ee3d7875017f" \
  -H "x-supabase-cron: true" \
  -d '{"source": "manual-test", "force": true}'
```

#### Common Issues

1. **No logs appearing**: 
   - Check if CRON_SECRET matches between Supabase and Next.js
   - Verify the API URL is correct

2. **Timeout errors**: 
   - Expected for long-running processes
   - The cron initiates the process which continues asynchronously
   - Check ProcessingStatus and SchedulingProcessLog tables for actual progress

3. **Authorization errors**: 
   - Verify the Bearer token format
   - Check CRON_SECRET value in both environments

4. **Scheduling not working**: 
   - Check user timezone settings in DataScheduling table
   - Verify dailyRunTime configuration
   - Check shouldRunScheduledTask logic with current time

#### Monitoring

The cron job logs extensively to both:
- Supabase Edge Function logs (visible in Supabase dashboard)
- Application database (SchedulingProcessLog table with category 'CRON_DEBUG')

Look for these log operations:
- `CRON_REQUEST_RECEIVED` - Cron job was triggered
- `CRON_AUTHORIZED` - Authentication successful
- `SCHEDULED_TASKS_START` - Task processing started
- `SCHEDULED_TASKS_COMPLETE` - Task processing finished