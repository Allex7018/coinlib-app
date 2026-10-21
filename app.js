// CryptoLab – convertor, portofoliu, „dacă investeam”, comparator (API CoinGecko, fără cheie)
const API = "https://api.coingecko.com/api/v3";
const CACHE_MS = 60 * 1000; // API-ul gratuit are limită de cereri, așa că refolosim datele 1 minut
// CoinGecko nu are RON: luăm prețurile în USD și le convertim cu cursul BCE de la Frankfurter
const FX_API = "https://api.frankfurter.dev/v1";
const PRICE_FIELDS = ["current_price", "market_cap", "total_volume", "high_24h", "low_24h", "ath"];

const $ = (sel) => document.querySelector(sel);
const marketCache = {}; // { usd: { time, coins: [...] } }
let coins = [];         // lista curentă de monede (top 100) în moneda aleasă
let fxRate = 1;         // cursul USD→RON folosit pentru `coins` (1 pentru celelalte monede)

// ---------- Utilitare ----------
function currency() {
  return $("#currency").value;
}

function money(value, cur = currency()) {
  if (value == null) return "—";
  const digits = value < 1 ? 6 : 2;
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: cur.toUpperCase(),
    maximumFractionDigits: digits,
  }).format(value);
}

// Pentru sume foarte mari: 1.675.690.885.017 → „1,68 tril. USD”
function moneyCompact(value, cur = currency()) {
  if (value == null) return "—";
  return new Intl.NumberFormat("ro-RO", {
    style: "currency",
    currency: cur.toUpperCase(),
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

function num(value, digits = 8) {
  return new Intl.NumberFormat("ro-RO", { maximumFractionDigits: digits }).format(value);
}

function percent(value) {
  if (value == null) return "—";
  const cls = value >= 0 ? "up" : "down";
  const sign = value >= 0 ? "+" : "";
  return `<span class="${cls}">${sign}${value.toFixed(2)}%</span>`;
}

function setStatus(text, isError = false) {
  const el = $("#status");
  el.textContent = text;
  el.classList.toggle("error", isError);
}

function findCoin(id) {
  return coins.find((c) => c.id === id);
}

async function getJSON(url) {
  const res = await fetch(url);
  if (res.status === 429) throw new Error("Prea multe cereri către API. Mai încearcă peste un minut.");
  if (!res.ok) throw new Error(`Eroare API (${res.status}).`);
  return res.json();
}

// ---------- Date din API ----------
async function usdToRon(date = "latest") {
  const data = await getJSON(`${FX_API}/${date}?base=USD&symbols=RON`);
  return data.rates.RON;
}

function convertPrices(coin, rate) {
  const copy = { ...coin };
  PRICE_FIELDS.forEach((field) => {
    if (copy[field] != null) copy[field] *= rate;
  });
  return copy;
}

async function loadMarkets(force = false) {
  const cur = currency();
  const cached = marketCache[cur];
  if (!force && cached && Date.now() - cached.time < CACHE_MS) {
    coins = cached.coins;
    fxRate = cached.rate;
    return coins;
  }
  setStatus("Se încarcă prețurile…");
  const apiCur = cur === "ron" ? "usd" : cur;
  const url = `${API}/coins/markets?vs_currency=${apiCur}&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h,7d`;
  coins = await getJSON(url);
  fxRate = cur === "ron" ? await usdToRon() : 1;
  if (fxRate !== 1) coins = coins.map((c) => convertPrices(c, fxRate));
  marketCache[cur] = { time: Date.now(), coins, rate: fxRate };
  $("#updated").textContent = new Date().toLocaleTimeString("ro-RO");
  $("#updated").dateTime = new Date().toISOString();
  setStatus("");
  return coins;
}

function fillCoinSelects() {
  const defaults = { convCoin: "bitcoin", pfCoin: "bitcoin", wiCoin: "bitcoin", cmp1: "bitcoin", cmp2: "ethereum" };
  document.querySelectorAll(".coin-select").forEach((select) => {
    const previous = select.value || defaults[select.id] || "";
    const options = coins
      .map((c) => `<option value="${c.id}">${c.name} (${c.symbol.toUpperCase()})</option>`)
      .join("");
    select.innerHTML = options;
    if (previous && findCoin(previous)) select.value = previous;
  });
}

// ---------- 0. Acasă: carusel cu monedele alese ----------
// Ordinea din carusel. Bitcoin, Solana și XRP au logo-uri desenate în HTML; restul folosesc imaginile CoinGecko.
const IMG = "https://coin-images.coingecko.com/coins/images";
const HOME_COINS = [
  { id: "ethereum", name: "Ethereum", image: `${IMG}/279/large/ethereum.png` },
  { id: "zcash", name: "Zcash", image: `${IMG}/486/large/Brandmark-Yellow_%281%29.png` },
  { id: "ripple", name: "XRP" },
  { id: "bitcoin", name: "Bitcoin" },
  { id: "near", name: "NEAR", image: `${IMG}/10365/large/near.jpg` },
  { id: "solana", name: "Solana" },
  { id: "dogecoin", name: "Dogecoin", image: `${IMG}/5/large/dogecoin.png` },
  { id: "injective-protocol", name: "Injective", image: `${IMG}/12882/large/Other_200x200.png` },
  { id: "sui", name: "Sui", image: `${IMG}/26375/large/sui-ocean-square.png` },
  { id: "monero", name: "Monero", image: `${IMG}/69/large/monero_logo.png` },
  { id: "litecoin", name: "Litecoin", image: `${IMG}/2/large/litecoin.png` },
];
let extraCoins = {}; // prețuri pentru monedele din afara top 100 (watchlist + carusel)
const carousel = { rotation: 0, anim: 0 };

function coinData(id) {
  return findCoin(id) || extraCoins[id];
}

// Monedele din top 100 au deja preț în `coins`; pentru restul facem o singură cerere
async function loadExtraPrices() {
  const ids = [...new Set([...watchlist.map((w) => w.id), ...HOME_COINS.map((c) => c.id)])];
  const missing = ids.filter((id) => !findCoin(id));
  extraCoins = {};
  if (!missing.length) return;
  const cur = currency();
  const apiCur = cur === "ron" ? "usd" : cur;
  try {
    const data = await getJSON(`${API}/coins/markets?vs_currency=${apiCur}&ids=${missing.join(",")}`);
    data.forEach((c) => (extraCoins[c.id] = convertPrices(c, fxRate)));
  } catch (err) {
    setStatus(err.message, true);
  }
}

// Pune cardurile în ordinea din HOME_COINS: le mută pe cele desenate în HTML și le creează pe celelalte
function buildHomeCards() {
  const ring = $("#coinRing");
  const drawn = Object.fromEntries(carouselCards().map((card) => [card.dataset.coin, card]));
  HOME_COINS.forEach((c) => {
    if (drawn[c.id]) {
      ring.append(drawn[c.id]);
      return;
    }
    ring.insertAdjacentHTML(
      "beforeend",
      `<article class="coin-card" data-coin="${c.id}">
        <img class="img coin-logo" src="${c.image}" alt="">
        <div class="textBox">
          <p class="text head">${c.name}</p>
          <span>Criptomonedă</span>
          <p class="text price">—</p>
        </div>
      </article>`
    );
  });
}

function renderHome() {
  carouselCards().forEach((card) => {
    const coin = coinData(card.dataset.coin);
    card.querySelector(".price").textContent = coin ? money(coin.current_price) : "—";
  });
}

function carouselCards() {
  return [...$("#coinRing").children];
}

// Cardurile stau pe un oval: în față mari și clare, în spate mici, estompate și puțin mai sus
function layoutCarousel() {
  const cards = carouselCards();
  const step = 360 / cards.length;
  const radius = Math.max(120, Math.min($("#carousel").clientWidth / 2 - 90, 420));
  let front = null;
  let best = -1;
  cards.forEach((card, i) => {
    const angle = ((i * step + carousel.rotation) * Math.PI) / 180;
    const depth = (Math.cos(angle) + 1) / 2; // 1 = în față, 0 = în spate
    const x = Math.sin(angle) * radius;
    const y = (1 - depth) * -45;
    card.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${0.5 + 0.5 * depth})`;
    card.style.zIndex = Math.round(depth * 100);
    card.style.opacity = 0.2 + 0.8 * depth;
    if (depth > best) {
      best = depth;
      front = card;
    }
  });
  cards.forEach((card) => card.classList.toggle("is-front", card === front));
}

function rotateTo(target) {
  cancelAnimationFrame(carousel.anim);
  const from = carousel.rotation;
  const start = performance.now();
  const duration = matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 450;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / duration);
    carousel.rotation = from + (target - from) * (1 - Math.pow(1 - t, 3)); // ease-out
    layoutCarousel();
    if (t < 1) carousel.anim = requestAnimationFrame(tick);
  };
  carousel.anim = requestAnimationFrame(tick);
}

// offset: -1 = următorul card, +1 = cel anterior, 0 = doar aliniază cel mai apropiat card
function snapCarousel(offset = 0) {
  const step = 360 / carouselCards().length;
  rotateTo(Math.round(carousel.rotation / step) * step + offset * step);
}

function bringToFront(card) {
  const step = 360 / carouselCards().length;
  let target = -carouselCards().indexOf(card) * step;
  target += Math.round((carousel.rotation - target) / 360) * 360; // pe drumul cel mai scurt
  rotateTo(target);
}

function setupCarousel() {
  const stage = $("#carousel");
  let startX = 0;
  let startRotation = 0;
  let dragging = false;
  let moved = false;
  let pressedCard = null;

  stage.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".carousel-btn")) return;
    dragging = true;
    moved = false;
    startX = e.clientX;
    startRotation = carousel.rotation;
    pressedCard = e.target.closest(".coin-card");
    cancelAnimationFrame(carousel.anim);
    stage.setPointerCapture(e.pointerId);
    stage.classList.add("dragging");
  });
  stage.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (Math.abs(dx) > 5) moved = true;
    carousel.rotation = startRotation + dx * 0.3; // grade per pixel tras
    layoutCarousel();
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    stage.classList.remove("dragging");
    if (!moved && pressedCard) bringToFront(pressedCard);
    else snapCarousel();
  };
  stage.addEventListener("pointerup", release);
  stage.addEventListener("pointercancel", release);

  stage.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") snapCarousel(-1);
    else if (e.key === "ArrowLeft") snapCarousel(1);
    else return;
    e.preventDefault();
  });
  $("#carouselNext").addEventListener("click", () => snapCarousel(-1));
  $("#carouselPrev").addEventListener("click", () => snapCarousel(1));
  window.addEventListener("resize", layoutCarousel);
  layoutCarousel();
}

// ---------- Watchlist (Acasă, salvat în browser) ----------
function loadWatchlist() {
  try {
    return JSON.parse(localStorage.getItem("watchlist")) || [];
  } catch {
    return [];
  }
}

function saveWatchlist(items) {
  try {
    localStorage.setItem("watchlist", JSON.stringify(items));
  } catch {
    // browser fără localStorage: watchlist-ul rămâne doar până la reîncărcare
  }
}

let watchlist = loadWatchlist(); // [{ id, name, symbol, image }]
let searchResults = [];
let searchTimer;

async function searchCoins() {
  const q = $("#coinSearch").value.trim().toLowerCase();
  if (q.length < 2) {
    searchResults = [];
    $("#searchResults").innerHTML = "";
    return;
  }
  try {
    const data = await getJSON(`${API}/search?query=${encodeURIComponent(q)}`);
    if ($("#coinSearch").value.trim().toLowerCase() !== q) return; // între timp s-a tastat altceva
    searchResults = data.coins.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
    renderSearchResults();
  } catch (err) {
    $("#searchResults").innerHTML = `<li class="empty">${err.message}</li>`;
  }
}

function renderSearchResults() {
  if (!searchResults.length) {
    $("#searchResults").innerHTML = '<li class="empty">Nicio monedă găsită.</li>';
    return;
  }
  $("#searchResults").innerHTML = searchResults
    .map((c) => {
      const added = watchlist.some((w) => w.id === c.id);
      return `<li><button type="button" data-id="${c.id}" ${added ? "disabled" : ""}>
        <img src="${c.thumb}" alt="">
        <span class="name">${c.name} <small>${c.symbol}</small></span>
        <span class="add">${added ? "În watchlist" : "+ Adaugă"}</span>
      </button></li>`;
    })
    .join("");
}

function addToWatchlist(coin) {
  if (!coin || watchlist.some((w) => w.id === coin.id)) return;
  watchlist.push({ id: coin.id, name: coin.name, symbol: coin.symbol, image: coin.large });
  saveWatchlist(watchlist);
  $("#coinSearch").value = "";
  searchResults = [];
  $("#searchResults").innerHTML = "";
  renderWatchlist();
  loadExtraPrices().then(renderWatchlist);
}

function removeFromWatchlist(id) {
  watchlist = watchlist.filter((w) => w.id !== id);
  saveWatchlist(watchlist);
  renderWatchlist();
}

function renderWatchlist() {
  const box = $("#watchlist");
  if (!watchlist.length) {
    box.innerHTML = '<li class="empty">Watchlist-ul e gol. Caută o monedă mai sus și adaug-o.</li>';
    return;
  }
  const head = `<li class="watch-row watch-head" aria-hidden="true">
    <span>Monedă</span><span>Preț curent</span><span>Min 24h</span><span></span><span>Max 24h</span><span></span>
  </li>`;
  box.innerHTML = head + watchlist
    .map((w) => {
      const coin = coinData(w.id);
      const low = coin?.low_24h;
      const high = coin?.high_24h;
      // poziția prețului curent între minimul și maximul zilei, în procente
      const pos = coin && high > low ? Math.min(100, Math.max(0, ((coin.current_price - low) / (high - low)) * 100)) : 50;
      return `<li class="watch-row">
        <span class="watch-coin">
          <img src="${w.image}" alt="">
          <span><strong>${w.name}</strong><small>${w.symbol.toUpperCase()}</small></span>
        </span>
        <span class="watch-price">
          <strong>${coin ? money(coin.current_price) : "—"}</strong>
          <small>${coin ? percent(coin.price_change_percentage_24h) : ""}</small>
        </span>
        <span class="watch-low"><small class="watch-label">Min 24h</small>${money(low)}</span>
        <span class="range-bar" title="Unde e prețul curent față de minimul și maximul din 24h">
          <span class="range-dot" style="left: ${pos}%"></span>
        </span>
        <span class="watch-high"><small class="watch-label">Max 24h</small>${money(high)}</span>
        <button type="button" class="watch-remove" data-id="${w.id}" aria-label="Scoate ${w.name} din watchlist">✕</button>
      </li>`;
    })
    .join("");
}

// ---------- 1. Convertor ----------
function convert(event) {
  event?.preventDefault();
  const form = $("#convertForm");
  const amount = parseFloat(form.amount.value);
  const coin = findCoin(form.coin.value);
  if (!coin || isNaN(amount)) return;

  const price = coin.current_price;
  const symbol = coin.symbol.toUpperCase();
  const out = $("#convResult");

  if (form.direction.value === "toFiat") {
    out.innerHTML = `<div class="card">${num(amount)} ${symbol} =
      <span class="big">${money(amount * price)}</span>
      <small>1 ${symbol} = ${money(price)} · 24h: ${percent(coin.price_change_percentage_24h)}</small></div>`;
  } else {
    out.innerHTML = `<div class="card">${money(amount)} =
      <span class="big">${num(amount / price)} ${symbol}</span>
      <small>1 ${symbol} = ${money(price)}</small></div>`;
  }
}

// ---------- 2. Portofoliu (salvat în browser) ----------
function loadPortfolio() {
  try {
    return JSON.parse(localStorage.getItem("portfolio")) || [];
  } catch {
    return [];
  }
}

function savePortfolio(items) {
  try {
    localStorage.setItem("portfolio", JSON.stringify(items));
  } catch {
    // browser fără localStorage: portofoliul rămâne doar până la reîncărcare
  }
}

let portfolio = loadPortfolio();

function addToPortfolio(event) {
  event.preventDefault();
  const form = $("#portfolioForm");
  const id = form.coin.value;
  const qty = parseFloat(form.qty.value);
  if (!id || !(qty > 0)) return;

  const existing = portfolio.find((p) => p.id === id);
  if (existing) existing.qty += qty;
  else portfolio.push({ id, qty });

  savePortfolio(portfolio);
  form.qty.value = "";
  renderPortfolio();
}

function removeFromPortfolio(id) {
  portfolio = portfolio.filter((p) => p.id !== id);
  savePortfolio(portfolio);
  renderPortfolio();
}

function renderPortfolio() {
  const body = $("#pfBody");
  if (!portfolio.length) {
    body.innerHTML = '<tr><td colspan="6" class="empty">Portofoliul e gol. Adaugă o monedă mai sus.</td></tr>';
    $("#pfTotal").textContent = "";
    return;
  }

  let total = 0;
  let totalYesterday = 0;
  body.innerHTML = portfolio
    .map((p) => {
      const coin = findCoin(p.id);
      if (!coin) return "";
      const value = p.qty * coin.current_price;
      const change = coin.price_change_percentage_24h || 0;
      total += value;
      totalYesterday += value / (1 + change / 100);
      return `<tr>
        <td><span class="coin-cell"><img src="${coin.image}" alt="">${coin.symbol.toUpperCase()}</span></td>
        <td>${num(p.qty)}</td>
        <td>${money(coin.current_price)}</td>
        <td>${money(value)}</td>
        <td>${percent(change)}</td>
        <td><button type="button" class="remove" data-id="${p.id}" aria-label="Șterge ${coin.name}">✕</button></td>
      </tr>`;
    })
    .join("");

  const diff = total - totalYesterday;
  const diffPct = totalYesterday ? (diff / totalYesterday) * 100 : 0;
  $("#pfTotal").innerHTML = `Total: <strong>${money(total)}</strong> · 24h: ${diff >= 0 ? "+" : ""}${money(diff)} (${percent(diffPct)})`;
}

// ---------- 4. Dacă investeam X atunci ----------
function setupDateLimits() {
  const input = $("#wiDate");
  const today = new Date();
  const max = new Date(today);
  max.setDate(today.getDate() - 1);
  const min = new Date(today);
  min.setDate(today.getDate() - 364);
  const iso = (d) => d.toISOString().slice(0, 10);
  input.max = iso(max);
  input.min = iso(min);
  const def = new Date(today);
  def.setMonth(today.getMonth() - 6);
  input.value = iso(def);
}

async function whatIf(event) {
  event.preventDefault();
  const form = $("#whatIfForm");
  const button = form.querySelector("button");
  const out = $("#wiResult");
  const amount = parseFloat(form.amount.value);
  const coin = findCoin(form.coin.value);
  const [y, m, d] = form.date.value.split("-");
  const cur = currency();

  button.disabled = true;
  out.innerHTML = "";
  try {
    const data = await getJSON(`${API}/coins/${coin.id}/history?date=${d}-${m}-${y}&localization=false`);
    let oldPrice = data.market_data?.current_price?.[cur];
    if (cur === "ron") {
      const usdPrice = data.market_data?.current_price?.usd;
      oldPrice = usdPrice && usdPrice * (await usdToRon(`${y}-${m}-${d}`));
    }
    if (!oldPrice) throw new Error("Nu există preț pentru data aleasă.");

    const units = amount / oldPrice;
    const nowValue = units * coin.current_price;
    const profit = nowValue - amount;
    const profitPct = (profit / amount) * 100;
    const date = new Date(form.date.value).toLocaleDateString("ro-RO");

    out.innerHTML = `<div class="card">
      Dacă investeai ${money(amount)} în ${coin.name} pe ${date}, azi ai avea
      <span class="big">${money(nowValue)}</span>
      ${profit >= 0 ? "Câștig" : "Pierdere"}: <span class="${profit >= 0 ? "up" : "down"}">${money(profit)}</span> (${percent(profitPct)})<br>
      <small>Preț atunci: ${money(oldPrice)} · preț acum: ${money(coin.current_price)} · ai fi cumpărat ${num(units)} ${coin.symbol.toUpperCase()}</small>
    </div>`;
  } catch (err) {
    out.innerHTML = `<div class="card down">${err.message}</div>`;
  } finally {
    button.disabled = false;
  }
}

// ---------- 5. Comparator ----------
function compare(event) {
  event?.preventDefault();
  const form = $("#compareForm");
  const ids = [...new Set([form.coin1.value, form.coin2.value].filter(Boolean))];
  const selected = ids.map(findCoin).filter(Boolean);
  if (!selected.length) return;

  const best24h = Math.max(...selected.map((c) => c.price_change_percentage_24h ?? -Infinity));

  $("#cmpResult").innerHTML = selected
    .map(
      (c) => `<article class="card compare-card ${selected.length > 1 && c.price_change_percentage_24h === best24h ? "best" : ""}">
        <h3><img src="${c.image}" alt="">${c.name}</h3>
        <dl>
          <dt>Loc</dt><dd>#${c.market_cap_rank}</dd>
          <dt>Preț</dt><dd>${money(c.current_price)}</dd>
          <dt>24h</dt><dd>${percent(c.price_change_percentage_24h)}</dd>
          <dt>7 zile</dt><dd>${percent(c.price_change_percentage_7d_in_currency)}</dd>
          <dt>Capitalizare</dt><dd title="${money(c.market_cap)}">${moneyCompact(c.market_cap)}</dd>
          <dt>Volum 24h</dt><dd title="${money(c.total_volume)}">${moneyCompact(c.total_volume)}</dd>
          <dt>Max 24h</dt><dd>${money(c.high_24h)}</dd>
          <dt>Min 24h</dt><dd>${money(c.low_24h)}</dd>
          <dt><abbr title="All-time high">Record</abbr></dt><dd>${money(c.ath)}</dd>
        </dl>
      </article>`
    )
    .join("");
}

// ---------- Tab-uri ----------
function showTab(hash) {
  let id = (hash || "#acasa").slice(1);
  const panel = document.getElementById(id);
  if (!panel?.classList.contains("panel") || panel.hidden) id = "acasa"; // secțiunile ascunse duc la Acasă
  document.querySelectorAll(".panel").forEach((p) => p.classList.toggle("active", p.id === id));
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.hash === `#${id}`));
  if (id === "acasa") layoutCarousel(); // cât timp e ascuns, caruselul nu are lățime
}

// ---------- Pornire ----------
async function refreshAll(force = false) {
  try {
    await loadMarkets(force);
    fillCoinSelects();
    await loadExtraPrices();
    renderHome();
    renderWatchlist();
    convert();
    renderPortfolio();
    compare();
    $("#wiResult").innerHTML = "";
  } catch (err) {
    setStatus(err.message || "Nu s-au putut încărca datele. Verifică conexiunea.", true);
  }
}

function init() {
  try {
    const saved = localStorage.getItem("currency");
    if (saved) $("#currency").value = saved;
  } catch {}

  setupDateLimits();
  showTab(location.hash);
  window.addEventListener("hashchange", () => showTab(location.hash));

  $("#currency").addEventListener("change", () => {
    try { localStorage.setItem("currency", currency()); } catch {}
    refreshAll();
  });
  $("#currencyForm").addEventListener("submit", (e) => e.preventDefault());
  $("#convertForm").addEventListener("submit", convert);
  $("#convertForm").addEventListener("input", () => convert());
  $("#portfolioForm").addEventListener("submit", addToPortfolio);
  $("#pfBody").addEventListener("click", (e) => {
    const btn = e.target.closest(".remove");
    if (btn) removeFromPortfolio(btn.dataset.id);
  });
  $("#whatIfForm").addEventListener("submit", whatIf);

  buildHomeCards();
  setupCarousel();
  renderWatchlist();
  $("#coinSearch").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(searchCoins, 400); // așteptăm să termine de tastat, ca să nu consumăm cereri
  });
  $("#searchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    addToWatchlist(searchResults.find((c) => !watchlist.some((w) => w.id === c.id)));
  });
  $("#searchResults").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (btn) addToWatchlist(searchResults.find((c) => c.id === btn.dataset.id));
  });
  $("#watchlist").addEventListener("click", (e) => {
    const btn = e.target.closest(".watch-remove");
    if (btn) removeFromWatchlist(btn.dataset.id);
  });
  $("#compareForm").addEventListener("submit", compare);
  refreshAll();
  setInterval(() => refreshAll(true), 2 * 60 * 1000); // prețuri noi la 2 minute
}

init();
