import {
  defaultThesis,
  parseThesis,
  type InvestmentThesis,
} from '../domain/thesis'

const storageKey = 'knowyourstocks.thesis'

type LoadThesisResult = {
  thesis: InvestmentThesis
  recoveryRequired: boolean
}

export const loadThesis = (): LoadThesisResult => {
  const storedValue = window.localStorage.getItem(storageKey)

  if (!storedValue) {
    return { thesis: defaultThesis, recoveryRequired: false }
  }

  try {
    return {
      thesis: parseThesis(JSON.parse(storedValue)),
      recoveryRequired: false,
    }
  } catch {
    return { thesis: defaultThesis, recoveryRequired: true }
  }
}

export const saveThesis = (thesis: InvestmentThesis): void => {
  window.localStorage.setItem(storageKey, JSON.stringify(thesis))
}
