# CryptoLab

Aplicație simplă (doar HTML, CSS, JavaScript) cu date live de la [CoinGecko API](https://www.coingecko.com/en/api) (gratuit, fără cheie).
Inițial era gândită pe Coinlib, dar API-ul Coinlib nu mai funcționează (toate adresele `/api/v1` dau 404).

## Funcții
1. **Convertor** crypto ↔ bani (USD / EUR / RON)
2. **Portofoliu**: adaugi monede și cantități, vezi valoarea totală și variația pe 24h (salvat în `localStorage`)
3. **Dacă investeam X atunci…**: cât valorează azi o investiție făcută la o dată din ultimul an
4. **Comparator**: 2–3 monede una lângă alta (cea mai bună pe 24h e evidențiată)

## Endpoint-uri folosite
- `GET /coins/markets?vs_currency=usd&per_page=100&price_change_percentage=24h,7d`
- `GET /coins/{id}/history?date=ZZ-LL-AAAA` (API-ul gratuit permite doar ultimele 365 de zile)

## Rulare
Deschide `index.html` în browser (sau `python3 -m http.server` în folder).
