# Shree Photo Studio

Shree Photo Studio is a simple desktop app for preparing passport-size photo sheets at my shop. It is designed to make a task that usually takes several manual editing and printing steps easier to repeat, even for someone who is not comfortable with complicated computer software.
![Uploading fit frame.png…]()


## The problem this project solves

I made this app for my shop because preparing identity photos by hand takes time: each photo has to be framed to the right size, adjusted, arranged into multiple copies, and checked before printing. It is easy to make mistakes in the crop or layout, and general-purpose photo software can be difficult for a busy shop workflow.

The app puts the essential steps on one screen. I can position and adjust a customer photo, see the exact 4 × 6 inch sheet layout, and download that sheet ready to open and print. This helps make photo preparation more consistent and straightforward at the shop.

## Features

- Simple three-section workflow: choose a photo, fit and adjust it, then review the sheet.
- Choose an image by browsing or dragging it into the app.
- Position the image in a 3.5 × 4.5 cm passport-photo frame; zoom and rotate it as needed.
- Adjust brightness, contrast, and saturation, and optionally add a photo border.
- Choose a sheet with 6 or 8 photos, with a preview of the selected layout.
- Download the preview as a PNG print sheet. The app does not open a printer dialog; print the downloaded file using the computer's photo viewer or printing software.
- Windows desktop installer built with Electron.

## How to use the app

1. Open Shree Photo Studio and choose or drop in a photo.
2. Drag the photo to position it in the frame. Scroll to zoom, or use the rotation controls if needed.
3. Select **Use this crop**, then adjust the image and choose 6 or 8 photos per sheet.
4. Check the 4 × 6 sheet preview.
5. Click **DOWNLOAD & PRINT**. Open the downloaded PNG in your preferred photo or printing application and select the printer and paper settings there.

The exported sheet is 300 DPI: 1200 × 1800 pixels for the portrait layout and 1800 × 1200 pixels for the landscape layout. Printing software and printer settings can scale an image, so select 4 × 6 inch paper and an appropriate fit/scale option when printing.

## Technology

- **Frontend:** Angular 19, TypeScript, Tailwind CSS
- **Desktop app:** Electron
- **Optional image API:** Python, FastAPI, OpenCV, rembg, and Pillow

## Project structure

```text
.
├── backend/
│   ├── main.py             # FastAPI image-processing API
│   └── requirements.txt
├── frontend/
│   └── src/                # Angular application
├── main.js                # Electron entry point
├── package.json            # Electron scripts and Windows packaging
└── README.md
```

## Run the desktop app for development

Install [Node.js](https://nodejs.org/) (which includes npm), then run these commands from the repository root:

```powershell
npm install
npm --prefix frontend install
npm start
```

`npm start` builds the Angular frontend and opens it in Electron.

To run the Angular frontend alone in a browser during UI development:

```powershell
npm --prefix frontend start
```

## Run the optional FastAPI backend

The repository also contains a FastAPI image-processing API in `backend/`. The current Electron desktop workflow does not start or require this API; it prepares the crop and print-sheet preview in the Angular frontend.

To run the API independently on Windows:

```powershell
cd backend
py -m venv venv
.\venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
py -m uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

The API provides:

- `GET /health`
- `POST /process-photo`
- `POST /generate-grid`
- `POST /enhance`

Interactive API documentation is available at `http://127.0.0.1:8000/docs` while the backend is running.

## Tests and Windows installer

Run the frontend unit tests:

```powershell
npm --prefix frontend run test -- --watch=false
```

Build the Windows installer:

```powershell
npm run dist:win
```

The installer is written to `release/`.

## Notes

- The app prepares a 3.5 × 4.5 cm identity-photo crop and 4 × 6 inch print sheets. Confirm that these dimensions match the requirements for the document or service you are preparing photos for.
- The **DOWNLOAD & PRINT** button downloads the image; it does not send a print job or choose a printer.
- Keep customer photos private and handle them in accordance with your shop's privacy practices.
