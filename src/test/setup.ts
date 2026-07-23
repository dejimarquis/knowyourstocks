import '@testing-library/jest-dom/vitest'

const localValues = new Map<string, string>()
const sessionValues = new Map<string, string>()

const createStorageMock = (values: Map<string, string>): Storage => ({
  get length() {
    return values.size
  },
  clear() {
    values.clear()
  },
  getItem(key) {
    return values.get(key) ?? null
  },
  key(index) {
    return [...values.keys()][index] ?? null
  },
  removeItem(key) {
    values.delete(key)
  },
  setItem(key, value) {
    values.set(key, value)
  },
})

Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: createStorageMock(localValues),
})

Object.defineProperty(window, 'sessionStorage', {
  configurable: true,
  value: createStorageMock(sessionValues),
})
