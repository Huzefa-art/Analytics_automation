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
    "scraping": {"active": False, "progress": "", "last_run": None, "logs": []},
    "analyzing": {"active": False, "progress": "", "last_run": None, "logs": []},
}

class ScrapeRequest(BaseModel):
    url: str
    max_results: Optional[int] = 50

class AnalysisRequest(BaseModel):
    file_path: Optional[str] = "urls.txt"
    include_tech: Optional[bool] = True
    include_ads: Optional[bool] = True

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
    status["scraping"]["logs"] = ["Starting scraper..."]
    
    def log_callback(msg):
        status["scraping"]["logs"].append(msg)
        status["scraping"]["progress"] = msg
        
    try:
        results = await scrape_google_maps(url, max_results, log_callback=log_callback)
        save_output(results, log_callback=log_callback)
        status["scraping"]["progress"] = f"Finished. Found {len(results)} leads."
        status["scraping"]["logs"].append(f"Finished. Found {len(results)} leads.")
    except Exception as e:
        status["scraping"]["progress"] = f"Error: {str(e)}"
        status["scraping"]["logs"].append(f"Error: {str(e)}")
    finally:
        status["scraping"]["active"] = False
        status["scraping"]["last_run"] = pd.Timestamp.now().isoformat()

@app.post("/scrape")
async def trigger_scrape(request: ScrapeRequest, background_tasks: BackgroundTasks):
    if status["scraping"]["active"]:
        raise HTTPException(status_code=400, detail="Scraping already in progress")
    
    background_tasks.add_task(run_scraping, request.url, request.max_results)
    return {"message": "Scraping started in background"}

@app.post("/analyze")
async def trigger_analysis(request: AnalysisRequest, background_tasks: BackgroundTasks):
    if status["analyzing"]["active"]:
        raise HTTPException(status_code=400, detail="Analysis already in progress")
        
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=400, detail=f"Input file '{request.file_path}' not found. Please scrape leads first or create urls.txt.")
    
    background_tasks.add_task(run_analysis, request.file_path, request.include_tech, request.include_ads)
    return {"message": "Analysis started in background"}

async def run_analysis(urls_file: str, include_tech: bool, include_ads: bool):
    status["analyzing"]["active"] = True
    status["analyzing"]["progress"] = "Starting tech analysis..."
    status["analyzing"]["logs"] = ["Starting tech analysis..."]
    try:
        import sys
        cmd = [sys.executable, "tech_detector.py", urls_file]
        if not include_tech:
            cmd.append("--no-tech")
        if not include_ads:
            cmd.append("--no-ads")
            
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT
        )
        
        while True:
            line = await process.stdout.readline()
            if not line:
                break
            output = line.decode('utf-8', errors='replace').strip()
            if output:
                status["analyzing"]["progress"] = output
                status["analyzing"]["logs"].append(output)
        
        await process.wait()
        status["analyzing"]["progress"] = "Analysis finished."
        status["analyzing"]["logs"].append("Analysis finished.")
    except Exception as e:
        status["analyzing"]["progress"] = f"Error: {str(e)}"
        status["analyzing"]["logs"].append(f"Error: {str(e)}")
    finally:
        status["analyzing"]["active"] = False
        status["analyzing"]["last_run"] = pd.Timestamp.now().isoformat()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
