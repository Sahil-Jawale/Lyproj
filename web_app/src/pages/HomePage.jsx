import { Link } from 'react-router-dom'
import { Upload, Shield, Brain, Clock, Mic, Pill, ChevronRight, Sparkles, Zap, Eye } from 'lucide-react'

const features = [
  { icon: Eye, title: 'Smart OCR', desc: 'AI reads handwritten prescriptions with 80%+ accuracy using fine-tuned TrOCR', color: 'from-blue-500 to-cyan-500' },
  { icon: Shield, title: 'Drug Safety', desc: 'Instant detection of dangerous drug interactions from a knowledge graph of 200+ rules', color: 'from-red-500 to-orange-500' },
  { icon: Brain, title: 'AI Matching', desc: 'Fuzzy matching corrects OCR errors against a database of 78+ medicine names', color: 'from-purple-500 to-pink-500' },
  { icon: Clock, title: 'History', desc: 'Complete digital record of all prescriptions with searchable timeline', color: 'from-amber-500 to-yellow-500' },
  { icon: Mic, title: 'Multilingual', desc: 'Patient-facing outputs with prescription abbreviation expansion (OD, BD, TDS)', color: 'from-green-500 to-emerald-500' },
  { icon: Pill, title: 'Medicine DB', desc: 'Built on the BD Prescription Dataset with 4,680 word segments across 78 classes', color: 'from-teal-500 to-cyan-500' },
]

const stats = [
  { value: '4,680', label: 'Training Samples' },
  { value: '78', label: 'Medicine Classes' },
  { value: '200+', label: 'Interaction Rules' },
  { value: '<3s', label: 'Processing Time' },
]

export default function HomePage() {
  return (
    <div className="relative">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24">
        <div className="text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass text-xs font-medium text-primary-400 mb-8 animate-fade-in">
            <Sparkles size={14} />
            AI-Powered Prescription Intelligence
          </div>

          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight mb-6 animate-slide-up">
            <span className="text-white">Turn Handwritten</span>
            <br />
            <span className="gradient-text">Prescriptions into</span>
            <br />
            <span className="text-white">Digital Records</span>
          </h1>

          <p className="text-lg sm:text-xl text-dark-300 max-w-2xl mx-auto mb-10 leading-relaxed animate-slide-up" style={{ animationDelay: '0.1s' }}>
            MedScript uses computer vision and NLP to digitize doctor handwriting,
            detect dangerous drug interactions, and keep patients safe.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            <Link to="/upload" className="btn-primary flex items-center gap-2 text-lg px-8 py-4">
              <Upload size={20} />
              Scan Prescription
              <ChevronRight size={18} />
            </Link>
            <Link to="/interactions" className="btn-secondary flex items-center gap-2 text-lg px-8 py-4">
              <Shield size={20} />
              Check Interactions
            </Link>
          </div>
        </div>

        {/* Stats bar */}
        <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto animate-slide-up" style={{ animationDelay: '0.3s' }}>
          {stats.map(({ value, label }) => (
            <div key={label} className="text-center glass-card py-4 px-3">
              <div className="text-2xl sm:text-3xl font-bold gradient-text">{value}</div>
              <div className="text-xs text-dark-400 mt-1 uppercase tracking-wider">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            Powered by <span className="gradient-text">Advanced AI</span>
          </h2>
          <p className="text-dark-400 max-w-xl mx-auto">
            Every component built with state-of-the-art machine learning, from TrOCR vision transformers to BioBERT NLP.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map(({ icon: Icon, title, desc, color }, i) => (
            <div key={title} className="glass-card group animate-slide-up" style={{ animationDelay: `${i * 0.08}s` }}>
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                <Icon size={22} className="text-white" />
              </div>
              <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
              <p className="text-sm text-dark-400 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
            How It <span className="gradient-text">Works</span>
          </h2>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
          {[
            { step: '01', title: 'Upload', desc: 'Take a photo or upload your prescription image', icon: Upload },
            { step: '02', title: 'AI Processing', desc: 'TrOCR extracts text, fuzzy matching corrects names', icon: Zap },
            { step: '03', title: 'Safety Check', desc: 'Knowledge graph checks all drug interactions instantly', icon: Shield },
          ].map(({ step, title, desc, icon: Icon }, i) => (
            <div key={step} className="text-center animate-slide-up" style={{ animationDelay: `${i * 0.15}s` }}>
              <div className="relative inline-flex mb-6">
                <div className="w-20 h-20 rounded-2xl glass flex items-center justify-center">
                  <Icon size={32} className="text-primary-400" />
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 rounded-lg gradient-bg flex items-center justify-center text-xs font-bold text-white shadow-lg">{step}</div>
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">{title}</h3>
              <p className="text-sm text-dark-400">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="glass-card text-center py-16 px-8 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-primary-600/10 to-accent-600/10" />
          <div className="relative z-10">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to digitize prescriptions?</h2>
            <p className="text-dark-300 mb-8 max-w-lg mx-auto">Upload your first prescription and see MedScript AI in action.</p>
            <Link to="/upload" className="btn-primary inline-flex items-center gap-2 text-lg px-8 py-4">
              Get Started <ChevronRight size={20} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  )
}
