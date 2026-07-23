import { useMemo, useState } from 'react'
import './App.css'
import { SecurityLookup } from './components/SecurityLookup'
import {
  defaultThesis,
  investmentHorizons,
  investmentStyles,
  riskProfiles,
  sectors,
  type InvestmentThesis,
} from './domain/thesis'
import { loadThesis, saveThesis } from './storage/thesisStorage'

function App() {
  const [initialThesis] = useState(() => loadThesis())
  const [thesis, setThesis] = useState<InvestmentThesis>(initialThesis.thesis)
  const [recoveryRequired, setRecoveryRequired] = useState(
    initialThesis.recoveryRequired,
  )
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  const selectedSectorNames = useMemo(
    () =>
      sectors
        .filter((sector) => thesis.sectors.includes(sector.id))
        .map((sector) => sector.label),
    [thesis.sectors],
  )

  const toggleSector = (sectorId: string) => {
    setThesis((current) => ({
      ...current,
      sectors: current.sectors.includes(sectorId)
        ? current.sectors.filter((id) => id !== sectorId)
        : [...current.sectors, sectorId],
    }))
  }

  const handleSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    saveThesis(thesis)
    setRecoveryRequired(false)
    setSaveStatus(
      `Saved in this browser at ${new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date())}`,
    )
  }

  const handleReset = () => {
    setThesis(defaultThesis)
    saveThesis(defaultThesis)
    setRecoveryRequired(false)
    setSaveStatus('Default thesis saved in this browser')
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="#top" aria-label="Know Your Stocks home">
          <span>Know Your Stocks</span>
        </a>
        <p>A clearer way to understand a stock</p>
      </header>

      <main id="top">
        <h1 className="visually-hidden">Understand a stock quickly</h1>

        <SecurityLookup thesis={thesis} />

        <details className="thesis-disclosure" id="thesis">
          <summary>
            <span>
              <strong>Personalize your results</strong>
              <small>
                {selectedSectorNames.join(', ')} ·{' '}
                {riskProfiles.find((option) => option.id === thesis.risk)?.label}
              </small>
            </span>
            <span className="summary-action">Edit thesis</span>
          </summary>

          <section className="workspace" aria-label="Investment thesis setup">
            <form className="thesis-form" onSubmit={handleSave}>
            {recoveryRequired ? (
              <div className="storage-alert" role="alert">
                Your saved thesis could not be read. Review these defaults, then
                save to replace the damaged browser data.
              </div>
            ) : null}
            <div className="section-heading">
              <div>
                <p className="step-label">Make it personal</p>
                <h2>Tell us what matters to you.</h2>
              </div>
              <span className="local-note">Saved only on this device</span>
            </div>

            <fieldset>
              <legend>Which areas do you want to understand better?</legend>
              <p className="field-help">Choose up to four themes for a focused first brief.</p>
              <div className="choice-grid">
                {sectors.map((sector) => {
                  const selected = thesis.sectors.includes(sector.id)
                  const disabled = !selected && thesis.sectors.length >= 4

                  return (
                    <label className="choice" key={sector.id}>
                      <input
                        checked={selected}
                        disabled={disabled}
                        name="sectors"
                        onChange={() => toggleSector(sector.id)}
                        type="checkbox"
                        value={sector.id}
                      />
                      <span>{sector.label}</span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="field-row">
              <label>
                <span>Investment horizon</span>
                <select
                  onChange={(event) =>
                    setThesis((current) => ({
                      ...current,
                      horizon: event.target.value as InvestmentThesis['horizon'],
                    }))
                  }
                  value={thesis.horizon}
                >
                  {investmentHorizons.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Risk comfort</span>
                <select
                  onChange={(event) =>
                    setThesis((current) => ({
                      ...current,
                      risk: event.target.value as InvestmentThesis['risk'],
                    }))
                  }
                  value={thesis.risk}
                >
                  {riskProfiles.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Primary style</span>
                <select
                  onChange={(event) =>
                    setThesis((current) => ({
                      ...current,
                      style: event.target.value as InvestmentThesis['style'],
                    }))
                  }
                  value={thesis.style}
                >
                  {investmentStyles.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="note-field" htmlFor="thesis-note">
              <span>What do you believe?</span>
              <textarea
                aria-label="What do you believe?"
                id="thesis-note"
                maxLength={500}
                onChange={(event) =>
                  setThesis((current) => ({
                    ...current,
                    note: event.target.value,
                  }))
                }
                placeholder="Example: I think companies that make AI infrastructure will compound over the next decade, but I want to avoid businesses with fragile cash flow."
                rows={4}
                value={thesis.note}
              />
              <span className="character-count">{thesis.note.length}/500</span>
            </label>

            <div className="form-actions">
              <button className="primary-action" type="submit">
                Save thesis
              </button>
              <button className="text-action" onClick={handleReset} type="button">
                Reset
              </button>
              {saveStatus ? (
                <p aria-live="polite" className="save-status">
                  {saveStatus}
                </p>
              ) : null}
            </div>
            </form>

            <aside className="thesis-summary" aria-labelledby="summary-title">
              <div>
                <p className="step-label">Your current lens</p>
                <h2 id="summary-title">A quick view of your preferences</h2>
              </div>

              <dl>
                <div>
                  <dt>Themes</dt>
                  <dd>
                    {selectedSectorNames.length > 0
                      ? selectedSectorNames.join(', ')
                      : 'Choose at least one'}
                  </dd>
                </div>
                <div>
                  <dt>Time horizon</dt>
                  <dd>
                    {investmentHorizons.find((option) => option.id === thesis.horizon)
                      ?.label ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt>Risk comfort</dt>
                  <dd>
                    {riskProfiles.find((option) => option.id === thesis.risk)?.label ??
                      '—'}
                  </dd>
                </div>
                <div>
                  <dt>Style</dt>
                  <dd>
                    {investmentStyles.find((option) => option.id === thesis.style)
                      ?.label ?? '—'}
                  </dd>
                </div>
              </dl>

              <div className="score-preview">
                <span>Updates instantly</span>
                <strong>Your next search uses this lens.</strong>
                <p>
                  Change a preference, then refresh the stock above to see how the
                  fit changes.
                </p>
              </div>
            </aside>
          </section>
        </details>

      </main>

      <footer>
        <p>Educational research, not investment advice.</p>
      </footer>
    </div>
  )
}

export default App
