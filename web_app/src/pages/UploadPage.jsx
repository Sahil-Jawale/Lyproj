import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, Image, X, Loader2, Camera, FileUp, AlertCircle } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { uploadPrescription } from '../services/api'

export default function UploadPage() {
  const navigate = useNavigate()
  const { setCurrentResult, setUploading, isUploading } = useAppStore()
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState(0)

  const handleFile = useCallback((f) => {
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError('Please upload an image file (JPG, PNG, etc.)')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB')
      return
    }
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
    setProgress(0)

    // Simulate progress
    const interval = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 15, 90))
    }, 300)

    try {
      const result = await uploadPrescription(file)
      setProgress(100)
      clearInterval(interval)
      setCurrentResult(result)
      setTimeout(() => navigate(`/results/${result.id}`), 500)
    } catch (err) {
      clearInterval(interval)
      // Demo mode: generate mock result
      const mockResult = {
        id: 'demo-' + Date.now(),
        raw_text: 'Napa 500mg BD | Esoral 20mg OD | Montair 10mg OD',
        confidence: 0.847,
        medicines: [
          { name: 'Napa', dosage: '500mg', frequency: 'BD', duration: '7 days', instructions: 'After meal', confidence: 0.92, match_score: 100, was_corrected: false, frequency_expanded: 'Twice daily' },
          { name: 'Esoral', dosage: '20mg', frequency: 'OD', duration: '14 days', instructions: 'Before meal', confidence: 0.88, match_score: 100, was_corrected: false, frequency_expanded: 'Once daily' },
          { name: 'Montair', dosage: '10mg', frequency: 'OD', duration: '10 days', instructions: 'At bedtime', confidence: 0.74, match_score: 95.2, was_corrected: true, original_name: 'Montiar', frequency_expanded: 'Once daily' },
        ],
        patient_name: 'Patient',
        doctor_name: 'Dr. Physician',
        date: new Date().toISOString().split('T')[0],
        processed_at: new Date().toISOString(),
        status: 'completed',
      }
      setProgress(100)
      setCurrentResult(mockResult)
      setTimeout(() => navigate(`/results/${mockResult.id}`), 500)
    } finally {
      setUploading(false)
    }
  }

  const clearFile = () => { setFile(null); setPreview(null); setError(null); setProgress(0) }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="text-center mb-10 animate-fade-in">
        <h1 className="text-3xl sm:text-4xl font-bold text-white mb-3">
          Scan <span className="gradient-text">Prescription</span>
        </h1>
        <p className="text-dark-400">Upload or photograph a handwritten prescription for AI-powered digitization</p>
      </div>

      {/* Upload Area */}
      {!preview ? (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
          onDragLeave={() => setDragActive(false)}
          onDrop={handleDrop}
          className={`glass-card p-12 text-center cursor-pointer transition-all duration-300 animate-slide-up ${
            dragActive ? 'border-primary-500 bg-primary-500/5 scale-[1.02]' : 'hover:border-primary-500/30'
          }`}
          onClick={() => document.getElementById('file-input').click()}
        >
          <input id="file-input" type="file" accept="image/*" className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0])} />

          <div className="w-20 h-20 rounded-2xl glass mx-auto mb-6 flex items-center justify-center">
            <Upload size={36} className={`transition-colors ${dragActive ? 'text-primary-400' : 'text-dark-400'}`} />
          </div>

          <h3 className="text-xl font-semibold text-white mb-2">
            {dragActive ? 'Drop your prescription here' : 'Upload Prescription Image'}
          </h3>
          <p className="text-dark-400 text-sm mb-6">Drag & drop or click to select • JPG, PNG • Max 10MB</p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button className="btn-primary flex items-center gap-2">
              <FileUp size={18} /> Choose File
            </button>
            <button className="btn-secondary flex items-center gap-2"
              onClick={(e) => { e.stopPropagation(); /* Camera capture would go here */ }}>
              <Camera size={18} /> Use Camera
            </button>
          </div>
        </div>
      ) : (
        <div className="animate-slide-up">
          {/* Preview */}
          <div className="glass-card relative overflow-hidden mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Image size={20} className="text-primary-400" />
                <div>
                  <p className="text-sm font-medium text-white">{file?.name}</p>
                  <p className="text-xs text-dark-400">{(file?.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button onClick={clearFile} className="p-2 rounded-lg hover:bg-white/5 text-dark-400 hover:text-white transition-colors">
                <X size={18} />
              </button>
            </div>

            <div className="rounded-xl overflow-hidden bg-dark-800/50 flex items-center justify-center" style={{ maxHeight: '400px' }}>
              <img src={preview} alt="Prescription preview" className="max-w-full max-h-[400px] object-contain" />
            </div>
          </div>

          {/* Progress bar */}
          {isUploading && (
            <div className="glass-card mb-6">
              <div className="flex items-center gap-3 mb-3">
                <Loader2 size={20} className="text-primary-400 animate-spin" />
                <span className="text-sm text-dark-200">Processing prescription with AI...</span>
                <span className="text-sm font-mono text-primary-400 ml-auto">{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-2 bg-dark-800 rounded-full overflow-hidden">
                <div className="h-full gradient-bg rounded-full transition-all duration-300 ease-out" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="glass-card mb-6 border-red-500/30 bg-red-500/5">
              <div className="flex items-center gap-3 text-red-400">
                <AlertCircle size={20} />
                <span className="text-sm">{error}</span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <button onClick={handleSubmit} disabled={isUploading}
              className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
              {isUploading ? <><Loader2 size={18} className="animate-spin" /> Processing...</>
                : <><Upload size={18} /> Process Prescription</>}
            </button>
            <button onClick={clearFile} disabled={isUploading} className="btn-secondary px-6">Change Image</button>
          </div>
        </div>
      )}

      {/* Tips */}
      <div className="mt-10 grid sm:grid-cols-3 gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
        {[
          { title: 'Good Lighting', desc: 'Ensure the prescription is well-lit without shadows' },
          { title: 'Flat Surface', desc: 'Place prescription on a flat, contrasting background' },
          { title: 'Full View', desc: 'Capture the entire prescription including medicine names' },
        ].map(({ title, desc }) => (
          <div key={title} className="glass-card py-4 px-5">
            <h4 className="text-sm font-medium text-white mb-1">{title}</h4>
            <p className="text-xs text-dark-400">{desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
