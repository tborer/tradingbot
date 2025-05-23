# Supabase Cron Jobs

This directory contains Supabase Edge Functions that are configured to run on a schedule.

## Scheduled Data Fetch

The `scheduled-data-fetch` function is configured to run daily at 11:45 PM. It triggers the application's data fetching and analysis process by calling the `/api/data-scheduling/cron-trigger` endpoint.

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
   supabase secrets set NEXT_API_URL=https://your-app-url.vercel.app
   supabase secrets set CRON_SECRET=your-cron-secret-value
   ```

5. Deploy the functions:
   ```
   supabase functions deploy scheduled-data-fetch
   ```

### Verification

To verify that your cron job is properly configured:

1. Go to the Supabase dashboard
2. Navigate to Edge Functions
3. Check that the `scheduled-data-fetch` function is listed with a cron schedule of `45 23 * * *`
4. You can also check the function logs to see if it's being triggered correctly

### Manual Testing

You can manually test the function by invoking it:

```
supabase functions invoke scheduled-data-fetch
```

This will trigger the function immediately, allowing you to verify that it correctly calls your API endpoint.