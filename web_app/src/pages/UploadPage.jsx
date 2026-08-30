import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { UploadCloud, ImageIcon, X, Loader2, FileUp, AlertCircle, ScanLine, Sun, Crop, Focus } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { uploadPrescription } from '../services/api'

/**
 * The stages a page actually goes through, in order. Shown instead of a
 * percentage: the old bar counted up on a timer that had nothing to do with the
 * request, which is a number that cannot be wrong because it means nothing.
 */
const STAGES = [
  'Normalising the page…',
  'Reading the handwriting…',
  'Matching against the Indian brand register…',
  'Verifying ingredients and screening interactions…',
]

const TIPS = [
  { icon: Sun,   title: 'Even light',   desc: 'No hard shadow across the page and no flash glare on the ink.' },
  { icon: Crop,  title: 'Whole page',   desc: 'Include the header and every line — a cropped edge is a lost medicine.' },
  { icon: Focus, title: 'Flat and sharp', desc: 'Lay it flat on a contrasting surface and let the camera focus before shooting.' },
]

export default function UploadPage() {
  const navigate = useNavigate()
  const { setCurrentResult, setUploading, isUploading } = useAppStore()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState(null)
  const [stage, setStage] = useState(0)
  const timer = useRef(null)

  useEffect(() => () => clearInterval(timer.current), [])

  const handleFile = useCallback((f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) return setError('That is not an image. Upload a JPG or PNG of the prescription.')
    if (f.size > 10 * 1024 * 1024) return setError('That file is over 10 MB. Please upload a smaller image.')
    setError(null)
    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target.result)
    reader.readAsDataURL(f)
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    setDragActive(false)
    handleFile(e.dataTransfer.files?.[0])
  }, [handleFile])

  const handleSubmit = async () => {
    if (!file) return
    setUploading(true)
    setError(null)
    setStage(0)
    timer.current = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 4000)

    try {
      const result = await uploadPrescription(file)
      setCurrentResult(result)
      // Phase 1: every extraction is verified before use (ARCHITECTURE_V2 §8.1),
      // so upload lands on the review screen, not a read-only view.
      navigate(`/review/${result.id}`)
    } catch (err) {
      // Deliberately NO fabricated demo result here. A medicine list invented by
      // the frontend after a failed request is indistinguishable from a real
      // reading on screen, and this is the one product where that must never
      // happen. A failure is reported as a failure.
      setError(
        err?.response?.data?.detail
        ?? (err?.code === 'ECONNABORTED'
              ? 'The read timed out. Dense pages can take a while — try again, or use a smaller image.'
              : 'Could not reach the PrescriptAI API. Check that the backend is running on port 8000.'),
      )
    } finally {
      clearInterval(timer.current)
      setUploading(false)
    }
  }

  const clearFile = () => { setFile(null); setPreview(null); setError(null); setStage(0) }

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <header className="mb-9 animate-fade-in">
        <span className="rule-label text-care-700">Step 01</span>
        <h1 className="mt-2 font-display text-4xl font-normal text-ink-900">Scan a prescription</h1>
        <p className="mt-2 max-w-xl text-ink-600">
          The page is normalised and downscaled before it leaves your machine. You will land on
          the review screen with the original image beside every line that was read.
        </p>
      </header>

      {!preview ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('file-input').click()}
          className={`animate-slide-up cursor-pointer rounded-xl border-2 border-dashed p-12 text-center transition-all duration-200 ${
            dragActive
              ? 'border-care-500 bg-care-50'
              : 'border-ink-300 bg-white/70 hover:border-care-400 hover:bg-white'
          }`}
        >
          <input id="file-input" type="file" accept="image/*" className="hidden"
                 onChange={(e) => handleFile(e.target.files?.[0])} />

          <span className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-2xl border border-care-200 bg-care-50">
            <UploadCloud size={34} className={dragActive ? 'text-care-700' : 'text-care-500'} />
          </span>

          <h2 className="font-display text-2xl font-semibold text-ink-900">
            {dragActive ? 'Drop it here' : 'Drop a prescription image'}
          </h2>
          <p className="mt-2 text-sm text-ink-500">or click to browse · JPG or PNG · up to 10 MB</p>

          <span className="btn-primary mt-7"><FileUp size={18} /> Choose a file</span>
        </div>
      ) : (
        <div className="animate-slide-up">
          <div className="card-tight mb-5 overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3.5">
              <div className="flex min-w-0 items-center gap-3">
                <ImageIcon size={18} className="shrink-0 text-care-600" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{file?.name}</p>
                  <p className="data text-xs text-ink-500">{(file?.size / 1024).toFixed(0)} KB</p>
                </div>
              </div>
              <button onClick={clearFile} disabled={isUploading}
                      className="rounded-lg p-2 text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900 disabled:opacity-40"
                      aria-label="Remove image">
                <X size={18} />
              </button>
            </div>

            <div className="bg-graph flex items-center justify-center bg-ink-50 p-4">
              <img src={preview} alt="Prescription preview"
                   className="max-h-[420px] max-w-full rounded-lg border border-ink-200 bg-white object-contain shadow-clinical" />
            </div>
          </div>

          {isUploading && (
            <div className="card mb-5">
              <div className="flex items-center gap-3">
                <Loader2 size={18} className="animate-spin text-care-700" />
                <span className="text-sm font-medium text-ink-800">{STAGES[stage]}</span>
              </div>
              {/* Indeterminate: it says work is happening, and claims nothing else. */}
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-100">
                <div className="h-full w-1/3 rounded-full bg-care-600 animate-sweep" />
              </div>
              <ol className="mt-4 space-y-1.5">
                {STAGES.map((s, i) => (
                  <li key={s} className={`flex items-center gap-2 text-xs ${i <= stage ? 'text-ink-700' : 'text-ink-400'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${i < stage ? 'bg-care-600' : i === stage ? 'bg-care-500 animate-vitals' : 'bg-ink-300'}`} />
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {error && (
            <div className="mb-5 flex items-start gap-3 rounded-xl border border-vital-200 bg-vital-50 px-4 py-3.5 text-sm text-vital-800">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold">The page was not processed.</p>
                <p className="mt-0.5">{error}</p>
                <p className="mt-1.5 text-xs text-vital-700">
                  Nothing was recorded. No medicines are shown because none were read — this
                  screen will not invent a result to fill the space.
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button onClick={handleSubmit} disabled={isUploading} className="btn-primary flex-1">
              {isUploading
                ? <><Loader2 size={18} className="animate-spin" /> Reading…</>
                : <><ScanLine size={18} /> Read this prescription</>}
            </button>
            <button onClick={clearFile} disabled={isUploading} className="btn-secondary">
              Choose another
            </button>
          </div>
        </div>
      )}

      <div className="mt-10 grid animate-slide-up gap-4 sm:grid-cols-3" style={{ animationDelay: '.15s' }}>
        {TIPS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="card">
            <Icon size={18} className="text-care-600" />
            <h3 className="mt-3 font-display text-base font-semibold text-ink-900">{title}</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-600">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
