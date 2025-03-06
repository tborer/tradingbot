import React from "react";
import Head from "next/head";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

export default function Home() {
  return (
    <>
      <Head>
        <title>StockTracker</title>
        <meta name="description" content="Track your stocks and get sell alerts" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <div className="bg-background min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 flex flex-col items-center justify-center p-8">
          <div className="max-w-4xl w-full text-center mb-12">
            <h1 className="text-4xl font-bold tracking-tight mb-4">
              Track Your Stocks. <span className="text-primary">Know When to Sell.</span>
            </h1>
            <p className="text-xl text-muted-foreground mb-8">
              Monitor your portfolio in real-time and receive alerts when stocks reach your target sell price.
            </p>
            <div className="flex justify-center gap-4">
              <Link href="/login">
                <Button size="lg">Sign In</Button>
              </Link>
              <Link href="/signup">
                <Button size="lg" variant="outline">Create Account</Button>
              </Link>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
            <Card>
              <CardHeader>
                <CardTitle>Track Your Portfolio</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Easily add stocks to your watchlist with their purchase prices.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Real-Time Updates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Get live price updates from Finnhub's websocket API.
                </p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle>Smart Sell Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Receive notifications when stocks reach your custom sell threshold.
                </p>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    </>
  );
}