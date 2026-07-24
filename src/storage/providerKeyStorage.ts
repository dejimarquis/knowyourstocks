const finnhubKeyStorageKey = 'knowyourstocks.finnhubKey'

export const loadFinnhubKey = () =>
  window.sessionStorage.getItem(finnhubKeyStorageKey) ?? ''

export const saveFinnhubKey = (value: string) => {
  const key = value.trim()

  if (key) {
    window.sessionStorage.setItem(finnhubKeyStorageKey, key)
  } else {
    window.sessionStorage.removeItem(finnhubKeyStorageKey)
  }
}
