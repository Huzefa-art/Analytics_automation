import os
import asyncio
import pandas as pd
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import subprocess
import json

# Import functions from existing scripts
from maps_leads_scraper import scrape_google_maps, save_output

app = FastAPI()

# Enable CORS for frontend interaction
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global status tracker
status = {
    "scraping": {"active": False, "progress": "", "last_run": None},
    "analyzing": {"active": False, "progress": "", "last_run": None},
}

class ScrapeRequest(BaseModel):
    url: str
    max_results: Optional[int] = 50

class AnalysisRequest(BaseModel):
    file_path: Optional[str] = "urls.txt"

@app.get("/status")
async def get_status():
    return status

@app.get("/results")
async def get_results():
    if os.path.exists("results.csv"):
        df = pd.read_csv("results.csv")
        # Fill NaN for JSON compatibility
        df = df.fillna("N/A")
        return df.to_dict(orient="records")
    return []

async def run_scraping(url: str, max_results: int):
    status["scraping"]["active"] = True
    status["scraping"]["progress"] = "Starting scraper..."
    try:
        results = await scrape_google_maps(url, max_results)
        save_output(results)
        status["scraping"]["progress"] = f"Finished. Found {len(results)} leads."
    except Exception as e:
        status["scraping"]["progress"] = f"Error: {str(e)}"
    finally:
        status["scraping"]["active"] = False
        status["scraping"]["last_run"] = pd.Timestamp.now().isoformat()

@app.post("/scrape")
async def trigger_scrape(request: ScrapeRequest, background_tasks: BackgroundTasks):
    if status["scraping"]["active"]:
        raise HTTPException(status_code=400, detail="Scraping already in progress")
    
    background_tasks.add_task(run_scraping, request.url, request.max_results)
    return {"message": "Scraping started in background"}

async def run_analysis(urls_file: str):
    status["analyzing"]["active"] = True
    status["analyzing"]["progress"] = "Starting tech analysis..."
    try:
        import sys
        # We shell out to tech_detector.py to avoid refactoring its main loop
        # and to handle its synchronous nature more easily.
        process = subprocess.Popen(
            [sys.executable, "tech_detector.py", urls_file],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        
        while True:
            output = process.stdout.readline()
            if output == '' and process.poll() is not None:
                break
            if output:
                status["analyzing"]["progress"] = output.strip()
        
        status["analyzing"]["progress"] = "Analysis finished."
    except Exception as e:
        status["analyzing"]["progress"] = f"Error: {str(e)}"
    finally:
        status["analyzing"]["active"] = False
        status["analyzing"]["last_run"] = pd.Timestamp.now().isoformat()

@app.post("/analyze")
async def trigger_analysis(request: AnalysisRequest, background_tasks: BackgroundTasks):
    if status["analyzing"]["active"]:
        raise HTTPException(status_code=400, detail="Analysis already in progress")
    
    background_tasks.add_task(run_analysis, request.file_path)
    return {"message": "Analysis started in background"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
