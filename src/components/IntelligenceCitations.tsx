import type { Citation } from '../intelligence/contracts'

type IntelligenceCitationsProps = {
  citations: Citation[]
  label?: string
}

export function IntelligenceCitations({
  citations,
  label = 'Sources',
}: IntelligenceCitationsProps) {
  if (citations.length === 0) {
    return null
  }

  return (
    <details className="intelligence-citations">
      <summary>
        {label} ({citations.length})
      </summary>
      <ul>
        {citations.map((citation) => (
          <li key={citation.evidenceId}>
            <strong>{citation.symbol}</strong>
            <span>{citation.text}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}
