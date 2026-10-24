const fs = require('fs');
const {
  Connection,
  Keypair,
  PublicKey,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const {
  createInitializeMintInstruction,
  MINT_SIZE,
  TOKEN_PROGRAM_ID,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  setAuthority,
  AuthorityType,
} = require('@solana/spl-token');
const { createUmi } = require('@metaplex-foundation/umi-bundle-defaults');
const {
  mplTokenMetadata,
  createV1,
  TokenStandard,
} = require('@metaplex-foundation/mpl-token-metadata');
const {
  keypairIdentity,
  percentAmount,
  createSignerFromKeypair,
} = require('@metaplex-foundation/umi');

const RPC = 'http://127.0.0.1:8900';
const MINT_AMOUNT = 500_000_000n * 1_000_000_000n;
const URI =
  'https://kenhas61.github.io/sethelion-metadata/sethelion-metadata.json';

async function main() {
  const configPath =
    process.env.HOME + '/.config/solana/cli/config.yml';

  if (!fs.existsSync(configPath)) {
    throw new Error('Solana CLI yapılandırması bulunamadı.');
  }

  const secretPath =
    process.env.HOME + '/.config/solana/id.json';

  if (!fs.existsSync(secretPath)) {
    throw new Error('CLI cüzdan dosyası bulunamadı.');
  }

  // Gizli anahtar yalnızca yerel bilgisayarda okunur.
  const secret = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
  const payer = Keypair.fromSecretKey(Uint8Array.from(secret));
  const connection = new Connection(RPC, 'confirmed');

  const balance = await connection.getBalance(payer.publicKey);
  console.log('Ağ: Localnet');
  console.log('Cüzdan:', payer.publicKey.toBase58());
  console.log('Yerel bakiye:', balance / LAMPORTS_PER_SOL, 'SOL');

  const mint = Keypair.generate();
  const rent = await connection.getMinimumBalanceForRentExemption(MINT_SIZE);
  const createMintTx = new Transaction().add(
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MINT_SIZE,
      lamports: rent,
      programId: TOKEN_PROGRAM_ID,
    }),
    createInitializeMintInstruction(
      mint.publicKey, 9, payer.publicKey, null, TOKEN_PROGRAM_ID
    )
  );

  await sendAndConfirmTransaction(
    connection, createMintTx, [payer, mint], { commitment: 'confirmed' }
  );

  console.log('Yeni test minti:', mint.publicKey.toBase58());

  const umi = createUmi(RPC).use(mplTokenMetadata());
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(
    Uint8Array.from(secret)
  );
  const signer = createSignerFromKeypair(umi, umiKeypair);
  umi.use(keypairIdentity(signer));

  const mintUmiKeypair = umi.eddsa.createKeypairFromSecretKey(
    Uint8Array.from(mint.secretKey)
  );
  const mintSigner = createSignerFromKeypair(umi, mintUmiKeypair);

  await createV1(umi, {
    mint: mintSigner,
    authority: umi.identity,
    payer: umi.payer,
    updateAuthority: umi.identity,
    name: 'Sethelion Network',
    symbol: 'STHLYN',
    uri: URI,
    sellerFeeBasisPoints: percentAmount(0),
    tokenStandard: TokenStandard.Fungible,
    decimals: 9,
    isMutable: false,
  }).sendAndConfirm(umi);

  console.log('Metadata oluşturuldu.');

  const tokenAccount = await getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint.publicKey,
    payer.publicKey
  );

  await mintTo(
    connection,
    payer,
    mint.publicKey,
    tokenAccount.address,
    payer,
    MINT_AMOUNT
  );

  await setAuthority(
    connection,
    payer,
    mint.publicKey,
    payer,
    [],
    AuthorityType.MintTokens,
    null
  );

  console.log('500.000.000 STHLYN basıldı; mint yetkisi kaldırıldı.');
  console.log('Token hesabı:', tokenAccount.address.toBase58());
  console.log('Yeni mint:', mint.publicKey.toBase58());
  console.log('İşlem tamamlandı. Sonuçlar zincirden kontrol edilmeli.');
}

main().catch((err) => {
  console.error('TEST BAŞARISIZ:', err.message);
  process.exitCode = 1;
});
