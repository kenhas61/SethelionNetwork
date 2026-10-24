const express = require("express");
const path = require("path");
const fs = require("fs");
const { Keypair, Connection, LAMPORTS_PER_SOL } =
  require("@solana/web3.js");

const app = express();
const PORT = 3000;
const RPC =
  process.env.SOLANA_RPC_URL ||
  "https://api.devnet.solana.com";

const NETWORK =
  /127\.0\.0\.1:8898|localhost:8898/.test(RPC)
    ? "Solana Localnet"
    : RPC.includes("devnet")
      ? "Solana Devnet"
      : "Solana Custom RPC";
const HISTORY_FILE = path.join(__dirname, "transaction-history.json");
const WALLET_FILE = path.join(
  __dirname,
  "wallet-keys",
  "wallet-1792234000761.json"
);

const connection = new Connection(RPC, "confirmed");
// Mainnet swap doğrulaması Localnet bağlantısından ayrı tutulur.
const mainnetRpc = process.env.SOLANA_MAINNET_RPC_URL ||
  "https://api.mainnet-beta.solana.com";
const mainnetConnection = new Connection(mainnetRpc, "confirmed");


function getWallet() {
  const secret = Uint8Array.from(
    JSON.parse(fs.readFileSync(WALLET_FILE, "utf8"))
  );
  return Keypair.fromSecretKey(secret);
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/api/wallet", async (req, res) => {
  try {
    const wallet = getWallet();
    const lamports = await connection.getBalance(wallet.publicKey);

    res.json({
      address: wallet.publicKey.toBase58(),
      balance: lamports / LAMPORTS_PER_SOL,
      network: NETWORK
    });
  } catch (error) {
    console.error("Wallet API error:", error.message);
    res.status(500).json({ error: "Wallet information unavailable" });
  }
});


app.get("/api/tokens", async (req, res) => {
  try {
    const { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } =
      require("@solana/spl-token");

    const wallet = getWallet();
    const owner = wallet.publicKey;

    const [classic, token2022] = await Promise.all([
      connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_PROGRAM_ID,
      }),
      connection.getParsedTokenAccountsByOwner(owner, {
        programId: TOKEN_2022_PROGRAM_ID,
      }),
    ]);

    const tokens = [...classic.value, ...token2022.value].map((item) => {
      const info = item.account.data.parsed.info;
      return {
        mint: info.mint,
        amount: info.tokenAmount.uiAmountString,
        decimals: info.tokenAmount.decimals,
      };
    });

    res.json({ tokens });
  } catch (error) {
    console.error("Token API error:", error.message);
    res.status(500).json({ error: "Token balances unavailable" });
  }
});


app.use(express.json({ limit: "10kb" }));

function parseSolToLamports(amount) {
  const value = amount.trim();
  if (!/^[0-9]+(?:\.[0-9]{1,9})?$/.test(value)) return null;

  const [whole, fraction = ""] = value.split(".");
  if (whole.length > 7) return null;

  const lamports = BigInt(whole) * 1000000000n
    + BigInt((fraction + "000000000").slice(0, 9));

  if (lamports <= 0n || lamports > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  return Number(lamports);
}

app.post("/api/transfer/preview", async (req, res) => {
  try {
    const { PublicKey, Transaction, SystemProgram } =
      require("@solana/web3.js");
    const { recipient, amount } = req.body || {};

    if (typeof recipient !== "string" || typeof amount !== "string") {
      return res.status(400).json({
        error: "Alıcı adresi ve tutar metin olarak gerekli."
      });
    }

    let destination;
    try {
      destination = new PublicKey(recipient.trim());
    } catch {
      return res.status(400).json({
        error: "Geçerli bir Solana alıcı adresi girin."
      });
    }

    if (!PublicKey.isOnCurve(destination.toBytes())) {
      return res.status(400).json({
        error: "Normal bir cüzdan adresi girin."
      });
    }

    if (!/^[0-9]+(?:\.[0-9]{1,9})?$/.test(amount.trim())) {
      return res.status(400).json({
        error: "Tutar en fazla 9 ondalık basamak içermeli."
      });
    }

    const sol = Number(amount);
    if (!Number.isFinite(sol) || sol <= 0) {
      return res.status(400).json({
        error: "Tutar sıfırdan büyük ve geçerli olmalı."
      });
    }

    const lamports = parseSolToLamports(amount);
    if (lamports === null) {
      return res.status(400).json({
        error: "Tutar güvenli biçimde dönüştürülemiyor."
      });
    }

    const wallet = getWallet();

    if (destination.equals(wallet.publicKey)) {
      return res.status(400).json({
        error: "Kendi cüzdanınıza transfer yapılamaz."
      });
    }

    const balance = await connection.getBalance(
      wallet.publicKey,
      "confirmed"
    );

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: destination,
        lamports
      })
    );

    const { blockhash } = await connection.getLatestBlockhash("confirmed");
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = blockhash;

    const fee = await connection.getFeeForMessage(
      transaction.compileMessage(),
      "confirmed"
    );

    if (fee.value === null) {
      return res.status(503).json({
        error: "Ağ ücreti şu anda hesaplanamıyor; daha sonra tekrar deneyin."
      });
    }

    const totalRequired = lamports + fee.value;

    if (balance < totalRequired) {
      return res.status(400).json({
        error: "Bakiye transfer tutarını ve tahmini ağ ücretini karşılamıyor.",
        currentBalanceSol: balance / LAMPORTS_PER_SOL,
        amountSol: lamports / LAMPORTS_PER_SOL,
        estimatedFeeSol: fee.value / LAMPORTS_PER_SOL
      });
    }

    res.json({
      network: NETWORK,
      sender: wallet.publicKey.toBase58(),
      recipient: destination.toBase58(),
      amountSol: lamports / LAMPORTS_PER_SOL,
      estimatedFeeSol: fee.value / LAMPORTS_PER_SOL,
      currentBalanceSol: balance / LAMPORTS_PER_SOL,
      totalRequiredSol: totalRequired / LAMPORTS_PER_SOL,
      note: "Yalnızca önizleme. İşlem imzalanmadı ve gönderilmedi."
    });
  } catch (error) {
    console.error("Transfer preview error:", error.message);
    res.status(500).json({
      error: "Transfer önizlemesi oluşturulamadı."
    });
  }
});

app.post("/api/transfer/send", async (req, res) => {
  try {
    const { PublicKey, Transaction, SystemProgram } =
      require("@solana/web3.js");
    const { recipient, amount } = req.body || {};

    if (typeof recipient !== "string" || typeof amount !== "string") {
      return res.status(400).json({
        error: "Alıcı adresi ve tutar metin olarak gerekli."
      });
    }

    if (!/^[0-9]+(?:\.[0-9]{1,9})?$/.test(amount.trim())) {
      return res.status(400).json({
        error: "Geçersiz SOL tutarı."
      });
    }

    const sol = Number(amount);
    if (!Number.isFinite(sol) || sol <= 0) {
      return res.status(400).json({ error: "Tutar sıfırdan büyük olmalı." });
    }

    let destination;
    try {
      destination = new PublicKey(recipient.trim());
    } catch {
      return res.status(400).json({ error: "Geçersiz alıcı adresi." });
    }

    if (!PublicKey.isOnCurve(destination.toBytes())) {
      return res.status(400).json({ error: "Normal bir cüzdan adresi gerekli." });
    }

    const lamports = parseSolToLamports(amount);
    if (lamports === null) {
      return res.status(400).json({ error: "Geçersiz transfer tutarı." });
    }

    const wallet = getWallet();
    if (destination.equals(wallet.publicKey)) {
      return res.status(400).json({ error: "Kendi cüzdanınıza transfer yapılamaz." });
    }

    const balance = await connection.getBalance(wallet.publicKey, "confirmed");
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: destination,
        lamports
      })
    );

    const latest = await connection.getLatestBlockhash("confirmed");
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = latest.blockhash;

    const fee = await connection.getFeeForMessage(
      transaction.compileMessage(),
      "confirmed"
    );

    if (fee.value === null) {
      return res.status(503).json({ error: "Ağ ücreti hesaplanamadı." });
    }

    if (balance < lamports + fee.value) {
      return res.status(400).json({
        error: "Yetersiz bakiye.",
        currentBalanceSol: balance / LAMPORTS_PER_SOL,
        totalRequiredSol: (lamports + fee.value) / LAMPORTS_PER_SOL
      });
    }

    transaction.sign(wallet);
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      { skipPreflight: false }
    );

    const confirmation = await connection.confirmTransaction(
      { signature, ...latest },
      "confirmed"
    );

    if (confirmation.value.err) {
      return res.status(502).json({
        error: "İşlem zincirde başarısız oldu.",
        signature,
        details: confirmation.value.err
      });
    }

    const record = {
      network: NETWORK,
      signature,
      sender: wallet.publicKey.toBase58(),
      recipient: destination.toBase58(),
      amountSol: lamports / LAMPORTS_PER_SOL,
      status: "confirmed",
      blockTime: Math.floor(Date.now() / 1000),
      explorerUrl: null
    };

    let history = [];
    try {
      if (fs.existsSync(HISTORY_FILE)) {
        history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
        if (!Array.isArray(history)) {
          throw new Error("Transaction history is not an array");
        }
      }
    } catch (historyError) {
      console.error("Confirmed transaction; history read failed:", historyError.message);
      res.set("Cache-Control", "no-store");
      return res.status(200).json({
        ...record,
        historySaved: false,
        warning: "Transfer onaylandı; işlem geçmişi okunamadığı için kayıt saklanamadı. Tekrar transfer göndermeyin."
      });
    }

    history = history.filter((item) => item.signature !== signature);
    history.unshift(record);

    const tempFile = HISTORY_FILE + ".tmp";
    try {
      fs.writeFileSync(
        tempFile,
        JSON.stringify(history.slice(0, 500), null, 2),
        { encoding: "utf8", mode: 0o600 }
      );
      fs.renameSync(tempFile, HISTORY_FILE);
    } catch (historyError) {
      try {
        if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      } catch {}
      console.error("Confirmed transaction; history write failed:", historyError.message);
      res.set("Cache-Control", "no-store");
      return res.status(200).json({
        ...record,
        historySaved: false,
        warning: "Transfer onaylandı ancak işlem geçmişine kaydedilemedi. Tekrar transfer göndermeyin.",
      });
    }

    res.set("Cache-Control", "no-store");
    res.json({ ...record, historySaved: true });
  } catch (error) {
    console.error("Transfer send error:", error.message);
    res.status(500).json({ error: "Transfer tamamlanamadı." });
  }
});

app.get("/api/transactions", async (req, res) => {
  try {
    const rawLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isInteger(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 20)
      : 10;

    const wallet = getWallet();
    let saved = [];

    try {
      if (fs.existsSync(HISTORY_FILE)) {
        saved = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8"));
        if (!Array.isArray(saved)) saved = [];
      }
    } catch (historyError) {
      console.error("Saved history read error:", historyError.message);
    }

    let chain = [];
    try {
      chain = await connection.getSignaturesForAddress(
        wallet.publicKey, { limit }, "confirmed"
      );
    } catch (rpcError) {
      console.error("Transaction RPC history error:", rpcError.message);
    }

    const chainRecords = chain.map((tx) => ({
      signature: tx.signature,
      blockTime: tx.blockTime ?? null,
      status: tx.err ? "failed" : "confirmed",
      error: tx.err ?? null,
      network: NETWORK,
      source: "rpc",
      explorerUrl:
        "https://explorer.solana.com/tx/" + tx.signature +
        "?cluster=custom&customUrl=" + encodeURIComponent(RPC)
    }));

    const merged = new Map();
    for (const tx of [...chainRecords, ...saved]) {
      if (tx && typeof tx.signature === "string" &&
          !merged.has(tx.signature)) {
        merged.set(tx.signature, tx);
      }
    }

    const transactions = [...merged.values()]
      .sort((a, b) => (Number(b.blockTime) || 0) - (Number(a.blockTime) || 0))
      .slice(0, limit);

    res.set("Cache-Control", "no-store");
    res.json({
      network: NETWORK,
      address: wallet.publicKey.toBase58(),
      source: "RPC + local history",
      transactions
    });
  } catch (error) {
    console.error("Transaction history error:", error.message);
    res.status(503).json({
      error: "İşlem geçmişi şu anda alınamıyor."
    });
  }
});

// CoinGecko fiyat önbelleği: tekrarlanan istekleri azaltır.
let priceCache = null;
let priceCacheAt = 0;
let priceFetchInFlight = null;
const PRICE_CACHE_TTL_MS = 60_000;
const PRICE_CACHE_FILE = require("path").join(__dirname, "price-cache.json");

try {
  if (fs.existsSync(PRICE_CACHE_FILE)) {
    const saved = JSON.parse(fs.readFileSync(PRICE_CACHE_FILE, "utf8"));
    if (saved.prices &&
        Number.isFinite(saved.prices.SOL) && saved.prices.SOL > 0 &&
        Number.isFinite(saved.prices.USDC) && saved.prices.USDC > 0) {
      priceCache = saved;

      // Sağlayıcının son güncelleme zamanını kullanarak önbellek yaşını hesapla.
      const providerTimes = [
        saved.updatedAt?.SOL,
        saved.updatedAt?.USDC
      ].filter(Number.isFinite);

      const latestProviderTime = providerTimes.length
        ? Math.max(...providerTimes) * 1000
        : 0;

      // Zaman bilgisi yoksa fiyatı taze varsayma.
      priceCacheAt = latestProviderTime > 0
        ? Math.min(latestProviderTime, Date.now())
        : 0;

      console.log("Önceki başarılı fiyat önbelleği yüklendi.");
    }
  }
} catch (error) {
  console.error("Fiyat önbelleği okunamadı:", error.message);
}

app.get("/api/prices", async (req, res) => {
  try {
    if (priceCache && Date.now() - priceCacheAt < PRICE_CACHE_TTL_MS) {
      res.set("Cache-Control", "no-store");
      return res.json({
        ...priceCache,
        cached: true,
        stale: false
      });
    }

    if (!priceFetchInFlight) {
      priceFetchInFlight = (async () => {
        const response = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana%2Cusd-coin&vs_currencies=usd&include_last_updated_at=true",
          { signal: AbortSignal.timeout(10000) }
        );

        if (!response.ok) {
          throw new Error("Price provider HTTP " + response.status);
        }

        const data = await response.json();
        const sol = data.solana?.usd;
        const usdc = data["usd-coin"]?.usd;

        if (!Number.isFinite(sol) || sol <= 0 ||
            !Number.isFinite(usdc) || usdc <= 0) {
          throw new Error("Provider returned invalid prices");
        }

        const result = {
          source: "CoinGecko",
          currency: "USD",
          prices: { SOL: sol, USDC: usdc },
          updatedAt: {
            SOL: data.solana.last_updated_at ?? null,
            USDC: data["usd-coin"].last_updated_at ?? null
          }
        };

        priceCache = result;
        priceCacheAt = Date.now();

        try {
          fs.writeFileSync(
            PRICE_CACHE_FILE,
            JSON.stringify(result, null, 2),
            { mode: 0o600 }
          );
        } catch (error) {
          console.error("Fiyat önbelleği kaydedilemedi:", error.message);
        }

        return result;
      })().finally(() => {
        priceFetchInFlight = null;
      });
    }

    const result = await priceFetchInFlight;
    res.set("Cache-Control", "no-store");
    return res.json({ ...result, cached: false, stale: false });
  } catch (error) {
    console.error("Price API error:", error.message);

    if (priceCache) {
      res.set("Cache-Control", "no-store");
      return res.json({
        ...priceCache,
        cached: true,
        stale: true,
        warning: "Fiyat sağlayıcısına ulaşılamadı; son başarılı fiyat gösteriliyor."
      });
    }

    return res.status(503).json({
      error: "Canlı fiyat şu anda alınamıyor; henüz kayıtlı başarılı fiyat yok."
    });
  }
});


// Jupiter Swap API V2: yalnızca fiyat teklifi, işlem imzalama/gönderme yok.
app.get("/api/quotes", async (req, res) => {
  const SOL_MINT = "So11111111111111111111111111111111111111112";
  const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
  const apiKey = process.env.JUPITER_API_KEY;

  async function getQuote(inputMint, outputMint, amount) {
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: String(amount)
    });

    const headers = {};
    if (apiKey) headers["x-api-key"] = apiKey;

    const response = await fetch(
      "https://api.jup.ag/swap/v2/order?" + params.toString(),
      { headers, signal: AbortSignal.timeout(12000) }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(
        "Jupiter HTTP " + response.status +
        (data.error ? ": " + String(data.error).slice(0, 180) : "")
      );
    }

    if (!data.outAmount || !data.inAmount) {
      throw new Error(data.errorMessage || "Geçerli teklif dönmedi.");
    }

    return data;
  }

  try {
    // Anahtarsız kullanımda Jupiter'ın düşük istek hızına uyum sağla.
    const buy = await getQuote(USDC_MINT, SOL_MINT, 100_000_000);
    await new Promise(resolve => setTimeout(resolve, 2200));
    const sell = await getQuote(SOL_MINT, USDC_MINT, 1_000_000_000);

    res.set("Cache-Control", "no-store");
    res.json({
      source: "Jupiter Swap API V2",
      network: "Solana mainnet quote",
      execution: false,
      note: "Yalnızca referans teklif. İşlem imzalanmadı veya gönderilmedi. Localnet bakiyesi kullanılamaz.",
      quotes: {
        buy: {
          direction: "100 USDC → SOL",
          inputAmount: Number(buy.inAmount) / 1e6,
          outputAmount: Number(buy.outAmount) / 1e9,
          outputSymbol: "SOL",
          router: buy.router || null,
          priceImpactPct: buy.priceImpactPct ?? null,
          feeBps: buy.feeBps ?? null,
          feeMint: buy.feeMint || null
        },
        sell: {
          direction: "1 SOL → USDC",
          inputAmount: Number(sell.inAmount) / 1e9,
          outputAmount: Number(sell.outAmount) / 1e6,
          outputSymbol: "USDC",
          router: sell.router || null,
          priceImpactPct: sell.priceImpactPct ?? null,
          feeBps: sell.feeBps ?? null,
          feeMint: sell.feeMint || null
        }
      },
      quotedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Jupiter quote error:", error.message);
    res.status(503).json({
      error: "Jupiter teklifleri alınamadı. API erişimini ve ağ bağlantısını kontrol edin.",
      detail: error.message.slice(0, 240),
      execution: false
    });
  }
});


// Kullanıcının girdiği miktar için Jupiter Mainnet teklif önizlemesi.
// Bu endpoint işlem imzalamaz ve göndermez.
app.get("/api/swap/quote", async (req, res) => {
  const TOKENS = {
    SOL: {
      mint: "So11111111111111111111111111111111111111112",
      decimals: 9
    },
    USDC: {
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6
    }
  };

  try {
    const inputSymbol = String(req.query.input || "").toUpperCase();
    const outputSymbol = String(req.query.output || "").toUpperCase();
    const rawAmount = String(req.query.amount || "");

    if (!TOKENS[inputSymbol] || !TOKENS[outputSymbol] ||
        inputSymbol === outputSymbol) {
      return res.status(400).json({
        error: "SOL ve USDC arasında geçerli bir yön seçin.",
        execution: false
      });
    }

    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(rawAmount)) {
      return res.status(400).json({
        error: "Geçerli bir miktar girin.",
        execution: false
      });
    }

    const tokenIn = TOKENS[inputSymbol];
    const tokenOut = TOKENS[outputSymbol];
    const parts = rawAmount.split(".");
    const fraction = parts[1] || "";

    if (fraction.length > tokenIn.decimals) {
      return res.status(400).json({
        error: inputSymbol + " için en fazla " +
          tokenIn.decimals + " ondalık basamak kullanılabilir.",
        execution: false
      });
    }

    const baseUnits = BigInt(parts[0]) *
      (10n ** BigInt(tokenIn.decimals)) +
      BigInt((fraction + "0".repeat(tokenIn.decimals)).slice(
        0, tokenIn.decimals
      ) || "0");

    if (baseUnits <= 0n ||
        Number(rawAmount) > 1000000 ||
        baseUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
      return res.status(400).json({
        error: "Miktar sıfırdan büyük ve en fazla 1.000.000 olmalıdır.",
        execution: false
      });
    }

    const params = new URLSearchParams({
      inputMint: tokenIn.mint,
      outputMint: tokenOut.mint,
      amount: baseUnits.toString()
    });

    const headers = {};
    if (process.env.JUPITER_API_KEY) {
      headers["x-api-key"] = process.env.JUPITER_API_KEY;
    }

    const response = await fetch(
      "https://api.jup.ag/swap/v2/order?" + params.toString(),
      { headers, signal: AbortSignal.timeout(12000) }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("Jupiter swap quote HTTP", response.status);
      return res.status(503).json({
        error: "Jupiter teklif sağlayıcısı isteği kabul etmedi.",
        detail: String(data.error || data.errorMessage ||
          "HTTP " + response.status).slice(0, 180),
        execution: false
      });
    }

    if (data.inAmount == null || data.outAmount == null ||
        !/^\d+$/.test(String(data.inAmount)) ||
        !/^\d+$/.test(String(data.outAmount)) ||
        BigInt(data.inAmount) <= 0n || BigInt(data.outAmount) <= 0n) {
      return res.status(503).json({
        error: "Jupiter geçerli bir teklif döndürmedi.",
        execution: false
      });
    }

    res.set("Cache-Control", "no-store");
    res.json({
      source: "Jupiter Swap API V2",
      network: "Solana Mainnet",
      execution: false,
      input: inputSymbol,
      output: outputSymbol,
      inputAmount: Number(data.inAmount) / (10 ** tokenIn.decimals),
      outputAmount: Number(data.outAmount) / (10 ** tokenOut.decimals),
      router: data.router || null,
      priceImpactPct: data.priceImpactPct ?? null,
      feeBps: data.feeBps ?? null,
      feeMint: data.feeMint || null,
      quotedAt: new Date().toISOString(),
      note: "Yalnızca Mainnet teklif önizlemesi. İşlem imzalanmadı veya gönderilmedi; Localnet bakiyesi kullanılamaz."
    });
  } catch (error) {
    console.error("Swap quote error:", error.message);
    res.status(503).json({
      error: "Swap teklifi alınamadı.",
      execution: false
    });
  }
});


// Jupiter V2: Phantom kullanıcısı için işlem taslağı.
app.post("/api/swap/order", async (req, res) => {
  const TOKENS = {
    SOL: {
      mint: "So11111111111111111111111111111111111111112",
      decimals: 9
    },
    USDC: {
      mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      decimals: 6
    }
  };

  try {
    const { PublicKey } = require("@solana/web3.js");
    const input = String(req.body?.input || "").toUpperCase();
    const output = String(req.body?.output || "").toUpperCase();
    const amount = String(req.body?.amount || "");
    const taker = String(req.body?.taker || "");

    if (!TOKENS[input] || !TOKENS[output] || input === output) {
      return res.status(400).json({ error: "Geçersiz token yönü." });
    }

    if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(amount)) {
      return res.status(400).json({ error: "Geçersiz miktar." });
    }

    let wallet;
    try {
      wallet = new PublicKey(taker);
    } catch {
      return res.status(400).json({ error: "Geçersiz Phantom adresi." });
    }

    if (wallet.toBase58() !== taker) {
      return res.status(400).json({ error: "Phantom adresi doğrulanamadı." });
    }

    const token = TOKENS[input];
    const parts = amount.split(".");
    const fraction = parts[1] || "";

    if (fraction.length > token.decimals || Number(amount) > 1000000) {
      return res.status(400).json({ error: "Miktar sınır dışında." });
    }

    const baseUnits =
      BigInt(parts[0]) * (10n ** BigInt(token.decimals)) +
      BigInt((fraction + "0".repeat(token.decimals)).slice(
        0, token.decimals
      ) || "0");

    if (baseUnits <= 0n || baseUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
      return res.status(400).json({ error: "Miktar geçersiz." });
    }

    const params = new URLSearchParams({
      inputMint: token.mint,
      outputMint: TOKENS[output].mint,
      amount: baseUnits.toString(),
      taker
    });

    const headers = {};
    if (process.env.JUPITER_API_KEY) {
      headers["x-api-key"] = process.env.JUPITER_API_KEY;
    }

    const response = await fetch(
      "https://api.jup.ag/swap/v2/order?" + params.toString(),
      { headers, signal: AbortSignal.timeout(15000) }
    );
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return res.status(502).json({
        error: "Jupiter işlem taslağı oluşturamadı.",
        detail: String(data.error || data.errorMessage ||
          "HTTP " + response.status).slice(0, 180)
      });
    }

    const jupiterError = String(
      data.error || data.errorMessage || ""
    ).trim();

    if (jupiterError) {
      const insufficientFunds =
        /insufficient funds|insufficient balance/i.test(jupiterError);

      return res.status(insufficientFunds ? 422 : 502).json({
        error: insufficientFunds
          ? "Yetersiz bakiye. Phantom Mainnet cüzdanını ve işlem ücretini kontrol et."
          : "Jupiter işlem taslağı oluşturamadı.",
        detail: jupiterError.slice(0, 180),
        execution: false
      });
    }

    const validBase64 =
      typeof data.transaction === "string" &&
      data.transaction.length >= 100 &&
      data.transaction.length <= 20000 &&
      /^[A-Za-z0-9+/]+={0,2}$/.test(data.transaction);

    const validAmounts =
      /^\d+$/.test(String(data.inAmount ?? "")) &&
      /^\d+$/.test(String(data.outAmount ?? "")) &&
      BigInt(data.inAmount || "0") === baseUnits &&
      BigInt(data.outAmount || "0") > 0n;

    if (!validBase64 ||
        typeof data.requestId !== "string" ||
        data.requestId.length < 8 ||
        data.requestId.length > 200 ||
        String(data.taker || "") !== taker ||
        String(data.inputMint || "") !== token.mint ||
        String(data.outputMint || "") !== TOKENS[output].mint ||
        !validAmounts) {
      console.error("Jupiter sipariş doğrulama ayrıntısı:", JSON.stringify({
        transactionLength: typeof data.transaction === "string"
          ? data.transaction.length : null,
        requestIdPresent: typeof data.requestId === "string"
          && data.requestId.length > 0,
        takerMatches: String(data.taker || "") === taker,
        inputMintMatches: String(data.inputMint || "") === token.mint,
        outputMintMatches: String(data.outputMint || "")
          === TOKENS[output].mint,
        inAmount: data.inAmount ?? null,
        expectedInAmount: baseUnits.toString(),
        outAmount: data.outAmount ?? null,
        router: data.router || null
      }));

      return res.status(502).json({
        error: "Jupiter sipariş doğrulamasından geçemedi.",
        execution: false
      });
    }

    res.set("Cache-Control", "no-store");
    return res.json({
      network: "Solana Mainnet",
      taker,
      transaction: data.transaction,
      requestId: data.requestId,
      inAmount: String(data.inAmount),
      outAmount: String(data.outAmount),
      input,
      output,
      router: data.router || null,
      feeBps: data.feeBps ?? null,
      feeMint: data.feeMint || null,
      lastValidBlockHeight: data.lastValidBlockHeight ?? null
    });
  } catch (error) {
    console.error("Jupiter order error:", error.message);
    return res.status(502).json({ error: "İşlem taslağı alınamadı." });
  }
});

// Yalnızca Phantom tarafından imzalanan işlem Jupiter'a iletilir.
// Aynı sunucu sürecinde aynı requestId'nin eşzamanlı yürütülmesini engeller.
// Sunucu yeniden başlatıldığında bu bellek içi kilit sıfırlanır.

const SWAP_STATE_FILE = path.join(
  __dirname, "swap-execution-state.json"
);

// Pending kayıtlar yeniden başlatmada da korunur.
// İmzalı işlem veya özel anahtar burada saklanmaz.
function loadSwapStates() {
  if (!fs.existsSync(SWAP_STATE_FILE)) return {};

  const parsed = JSON.parse(
    fs.readFileSync(SWAP_STATE_FILE, "utf8")
  );

  if (!parsed || typeof parsed !== "object" ||
      Array.isArray(parsed)) {
    throw new Error("Swap durum dosyası geçersiz; güvenlik için başlatma durduruldu.");
  }

  return parsed;
}

let swapStates = loadSwapStates();

function persistSwapStates() {
  const tmp = SWAP_STATE_FILE + ".tmp";
  fs.writeFileSync(
    tmp,
    JSON.stringify(swapStates, null, 2),
    { mode: 0o600 }
  );
  fs.renameSync(tmp, SWAP_STATE_FILE);
}

const activeSwapExecutions = new Set();

// Salt okunur swap durumu. Bulunamayan kayıt, işlemin yapılmadığını kanıtlamaz.
app.get("/api/swap/status", (req, res) => {
  res.set("Cache-Control", "no-store");

  const requestId = req.query.requestId;
  if (typeof requestId !== "string" ||
      requestId.length < 8 || requestId.length > 200) {
    return res.status(400).json({
      error: "Geçerli bir requestId gerekli.",
      doNotRetryAutomatically: true
    });
  }

  if (!Object.prototype.hasOwnProperty.call(swapStates, requestId)) {
    return res.status(404).json({
      status: "not_found",
      message: "Kayıt bulunamadı. Bu, işlemin gerçekleşmediğini kanıtlamaz.",
      doNotRetryAutomatically: true
    });
  }

  const state = swapStates[requestId];
  return res.json({
    requestId,
    status: state.status || "unknown",
    createdAt: state.createdAt || null,
    confirmedAt: state.confirmedAt || null,
    lastCheckedAt: state.lastCheckedAt || null,
    providerStatus: state.providerStatus || null,
    verificationError: state.verificationError || null,
    signature: typeof state.signature === "string"
      ? state.signature : null,
    doNotRetryAutomatically: true
  });
});

app.post("/api/swap/execute", async (req, res) => {
  let requestId;
  let locked = false;

  try {
    const body = req.body || {};
    const signedTransaction = body.signedTransaction;
    requestId = body.requestId;

    if (typeof signedTransaction !== "string" ||
        signedTransaction.length < 100 ||
        signedTransaction.length > 20000 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(signedTransaction) ||
        typeof requestId !== "string" ||
        requestId.length < 8 || requestId.length > 200) {
      return res.status(400).json({ error: "İşlem verisi geçersiz." });
    }

    res.set("Cache-Control", "no-store");

    if (activeSwapExecutions.has(requestId) ||
        Object.prototype.hasOwnProperty.call(swapStates, requestId)) {
      return res.status(409).json({
        error: "Bu istek daha önce kaydedildi. İşlem durumunu doğrulamadan tekrar göndermeyin.",
        executionPending: swapStates[requestId]?.status === "pending",
        doNotRetryAutomatically: true
      });
    }

    if (Object.keys(swapStates).length >= 2000) {
      return res.status(503).json({
        error: "Kalıcı swap kayıt sınırına ulaşıldı. Güvenli inceleme gerekiyor."
      });
    }

    // Jupiter çağrısından önce pending kaydını kalıcılaştır.
    // Yazma başarısızsa yürütmeye geçme.
    const previousState = swapStates[requestId];

    swapStates[requestId] = {
      status: "pending",
      createdAt: new Date().toISOString()
    };

    try {
      persistSwapStates();
    } catch (persistError) {
      if (previousState === undefined) {
        delete swapStates[requestId];
      } else {
        swapStates[requestId] = previousState;
      }

      console.error(
        "Initial swap state persistence error:",
        persistError.message
      );

      return res.status(503).json({
        error: "Swap durumu güvenli biçimde kaydedilemedi; işlem gönderilmedi.",
        executionPending: false,
        doNotRetryAutomatically: true
      });
    }

    activeSwapExecutions.add(requestId);
    locked = true;

    const headers = { "Content-Type": "application/json" };
    if (process.env.JUPITER_API_KEY) {
      headers["x-api-key"] = process.env.JUPITER_API_KEY;
    }

    const response = await fetch(
      "https://api.jup.ag/swap/v2/execute",
      {
        method: "POST",
        headers,
        body: JSON.stringify({ signedTransaction, requestId }),
        signal: AbortSignal.timeout(60000)
      }
    );

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // HTTP hatası, işlemin zincirde gerçekleşmediğini tek başına kanıtlamaz.
      const checkedAt = new Date().toISOString();
      const previous = swapStates[requestId];

      swapStates[requestId] = {
        ...previous,
        status: previous.status === "confirmed"
          ? "confirmed"
          : "pending",
        providerHttpStatus: response.status,
        lastCheckedAt: checkedAt,
        verificationError:
          "Jupiter HTTP hatası verdi; zincir durumu kesinleşmedi."
      };
      persistSwapStates();

      return res.status(502).json({
        error: "Jupiter yürütme isteğini reddetti.",
        detail: String(data.error || data.errorMessage ||
          "HTTP " + response.status).slice(0, 180),
        executionPending: true,
        doNotRetryAutomatically: true
      });
    }

    const status = String(data.status || "Unknown");
    const signature =
      typeof data.signature === "string" &&
      /^[1-9A-HJ-NP-Za-km-z]{32,100}$/.test(data.signature)
        ? data.signature
        : null;

    let chainConfirmed = false;
    let chainError = null;

    if (status === "Success" && signature) {
      try {
        const tx = await mainnetConnection.getTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0
        });

        chainConfirmed = Boolean(tx && tx.meta && tx.meta.err === null);
      } catch (verifyError) {
        chainError = "Mainnet işlem doğrulaması şu anda yapılamadı.";
        console.error("Mainnet swap verification:", verifyError.message);
      }
    }

    const confirmedSuccess =
      status === "Success" && signature !== null && chainConfirmed;

    const checkedAt = new Date().toISOString();

    // Her Jupiter sonucunu kalıcı kaydet.
    // Zincir doğrulanmadan başarı veya kesin başarısızlık varsayma.
    swapStates[requestId] = {
      ...swapStates[requestId],
      status: confirmedSuccess
        ? "confirmed"
        : "pending",
      providerStatus: status,
      signature,
      lastCheckedAt: checkedAt,
      ...(confirmedSuccess
        ? { confirmedAt: checkedAt }
        : {
            verificationError: chainError ||
              (status === "Success"
                ? "İşlem Mainnet üzerinde henüz doğrulanamadı."
                : "Sonuç kesinleşmedi; otomatik tekrar gönderim yapmayın.")
          })
    };
    persistSwapStates();

    return res.json({
      status: confirmedSuccess ? "Success" : status,
      signature: confirmedSuccess ? signature : null,
      verifiedOnMainnet: confirmedSuccess,
      verificationPending: status === "Success" && !chainConfirmed,
      verificationError: chainError,
      code: data.code ?? null,
      error: data.error || null,
      totalInputAmount: data.totalInputAmount || null,
      totalOutputAmount: data.totalOutputAmount || null,
      doNotRetryAutomatically: status === "Success" && !chainConfirmed
    });
  } catch (error) {
    console.error("Jupiter execute error:", error.message);

    let statePersistenceError = false;

    // Yalnızca önceden oluşturulmuş kaydı güncelle.
    // Belirsiz sonucu başarısız sayma ve kaydı silme.
    if (
      typeof requestId === "string" &&
      Object.prototype.hasOwnProperty.call(swapStates, requestId)
    ) {
      try {
        const previous = swapStates[requestId];

        swapStates[requestId] = {
          ...previous,
          status: previous.status === "confirmed"
            ? "confirmed"
            : "pending",
          lastCheckedAt: new Date().toISOString(),
          verificationError:
            "Yürütme sonucu kesinleştirilemedi. Zincir durumu ayrıca doğrulanmalı."
        };

        persistSwapStates();
      } catch (persistError) {
        statePersistenceError = true;
        console.error(
          "Swap state persistence error:",
          persistError.message
        );
      }
    }

    return res.status(502).json({
      error: "Yürütme sonucu kesinleştirilemedi. İşlem durumunu kontrol etmeden tekrar göndermeyin.",
      executionPending: true,
      statePersistenceError,
      doNotRetryAutomatically: true
    });
  } finally {
    if (locked) activeSwapExecutions.delete(requestId);
  }
});

// Mainnet RPC kimliği doğrulanmadan HTTP sunucusunu başlatma.
(async () => {
  const expectedGenesis =
    "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d";

  try {
    const actualGenesis = await mainnetConnection.getGenesisHash();

    if (actualGenesis !== expectedGenesis) {
      throw new Error("Mainnet genesis hash eşleşmedi.");
    }

    console.log("Mainnet RPC genesis hash doğrulandı.");
    app.listen(PORT, "127.0.0.1", () => {
      console.log(`Sethelion Network: http://127.0.0.1:${PORT}`);
    });
  } catch (error) {
    console.error(
      "GÜVENLİK: Mainnet RPC doğrulanamadı; sunucu başlatılmadı.",
      error.message
    );
    process.exitCode = 1;
  }
})();
