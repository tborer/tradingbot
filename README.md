# Cryptocurrency Portfolio Management Web Application

A comprehensive web application for cryptocurrency portfolio management with AI-powered trading recommendations and automated data scheduling.

## Features

- **Portfolio Management**: Track and manage your cryptocurrency investments
- **AI-Powered Trading Recommendations**: Get intelligent trading suggestions based on market analysis
- **Automated Data Scheduling**: Regular data collection and analysis for up-to-date insights
- **Technical Analysis**: Calculate and visualize key technical indicators
- **Research Tools**: Advanced research capabilities for informed decision-making

## Scheduled Data Fetching

The application uses Supabase cron jobs to automatically fetch cryptocurrency data daily at 11:45 PM. This ensures that the latest data is available for analysis and trading recommendations.

### Supabase Cron Job Setup

The cron job is configured in the `supabase/functions/scheduled-data-fetch` directory. See the [Supabase README](./supabase/README.md) for deployment instructions.

## Getting Started

1. Clone this repository
2. Install dependencies:
   ```
   npm install
   ```
3. Set up the required environment variables (see `.env.example`)
4. Run the development server:
   ```
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000) in your browser to see the result.

## Project Structure

- `pages/`: Contains all the pages of the application
- `components/`: Reusable React components
- `contexts/`: Global state management using Context API
- `lib/`: Core functionality and services
- `hooks/`: Custom React hooks
- `styles/`: Global styles
- `util/`: Utility functions and helpers
- `supabase/`: Supabase functions and cron job configurations