const express = require('express');
const session = require('express-session');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const https = require('https');
const crypto = require('crypto');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 3000;

const qrRateLimit = new Map();
const QR_RATE_LIMIT = 30;
const QR_RATE_WINDOW = 60000;

const checkQrRateLimit = (ip) => {
  const now = Date.now();
  const record = qrRateLimit.get(ip);
  if (record) {
    const windowStart = now - QR_RATE_WINDOW;
    const recentRequests = record.filter(ts => ts > windowStart);
    if (recentRequests.length >= QR_RATE_LIMIT) {
      return false;
    }
    recentRequests.push(now);
    qrRateLimit.set(ip, recentRequests);
  } else {
    qrRateLimit.set(ip, [now]);
  }
  return true;
};

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(expressLayouts);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads/products', express.static(path.join(__dirname, 'public', 'uploads', 'products')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'game-store-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));

const uploadsDir = path.join(__dirname, 'public', 'uploads', 'products');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Hanya file gambar (JPEG, PNG, GIF, WebP) yang diizinkan'), false);
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter
});

const dbPath = path.join(__dirname, 'database');
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

const initDB = (filename, defaultData) => {
  const filePath = path.join(dbPath, filename);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
  }
  return filePath;
};

const readDB = (filename) => {
  const filePath = path.join(dbPath, filename);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
};

const writeDB = (filename, data) => {
  const filePath = path.join(dbPath, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

const defaultPricingOptions = [
  { days: 1, price: 0 },
  { days: 3, price: 0 },
  { days: 7, price: 0 }
];

const toCleanString = (value, fallback = '') => {
  if (typeof value !== 'string') return fallback;
  return value.trim();
};

const toArray = (value) => {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
};

const getPricingOptions = (product = {}) => {
  const sourceOptions = Array.isArray(product.pricingOptions) && product.pricingOptions.length > 0
    ? product.pricingOptions
    : [
        { days: 1, price: product.price1day },
        { days: 3, price: product.price3day },
        { days: 7, price: product.price7day },
        ...Object.entries(product.customPrices || {}).map(([days, price]) => ({ days, price }))
      ];

  const pricingMap = new Map();

  sourceOptions.forEach((option) => {
    const days = parseInt(option?.days, 10);
    const rawPrice = parseInt(option?.price, 10);

    if (!Number.isFinite(days) || days <= 0) {
      return;
    }

    pricingMap.set(days, {
      days,
      price: Number.isFinite(rawPrice) && rawPrice >= 0 ? rawPrice : 0
    });
  });

  if (pricingMap.size === 0) {
    defaultPricingOptions.forEach((option) => {
      pricingMap.set(option.days, { ...option });
    });
  }

  return Array.from(pricingMap.values()).sort((a, b) => a.days - b.days);
};

const applyPricingOptions = (product, pricingOptions) => {
  const normalizedOptions = getPricingOptions({ pricingOptions });
  const customPrices = {};

  normalizedOptions.forEach((option) => {
    if (![1, 3, 7].includes(option.days)) {
      customPrices[option.days] = option.price;
    }
  });

  product.pricingOptions = normalizedOptions;
  product.price1day = normalizedOptions.find((option) => option.days === 1)?.price ?? 0;
  product.price3day = normalizedOptions.find((option) => option.days === 3)?.price ?? 0;
  product.price7day = normalizedOptions.find((option) => option.days === 7)?.price ?? 0;
  product.customDays = Object.keys(customPrices).map(Number).sort((a, b) => a - b);
  product.customPrices = customPrices;

  return product;
};

const parsePricingOptionsInput = (daysInput, pricesInput) => {
  const dayList = toArray(daysInput);
  const priceList = toArray(pricesInput);
  const pricingOptions = dayList.map((days, index) => ({
    days,
    price: priceList[index]
  }));

  return getPricingOptions({ pricingOptions });
};

const normalizeProduct = (product = {}) => {
  const normalizedProduct = { ...product };

  applyPricingOptions(normalizedProduct, getPricingOptions(product));

  normalizedProduct.description = typeof normalizedProduct.description === 'string' ? normalizedProduct.description : '';
  normalizedProduct.image = toCleanString(normalizedProduct.image, '/images/placeholder.jpg') || '/images/placeholder.jpg';
  normalizedProduct.keys = Array.isArray(normalizedProduct.keys) ? normalizedProduct.keys : [];

  return normalizedProduct;
};

const normalizeProducts = (products) => Array.isArray(products) ? products.map(normalizeProduct) : [];

const normalizeSettings = (settings = {}) => ({
  ...settings,
  siteName: toCleanString(settings.siteName, 'DMW STORE') || 'DMW STORE',
  gamePanelName: toCleanString(settings.gamePanelName, 'DMW STORE') || 'DMW STORE',
  about: toCleanString(settings.about || ''),
  faq: toCleanString(settings.faq || ''),
  marqueeText: toCleanString(settings.marqueeText || ''),
  contact: {
    whatsapp: toCleanString(settings.contact?.whatsapp, ''),
    telegram: toCleanString(settings.contact?.telegram, ''),
    email: toCleanString(settings.contact?.email, '')
  },
  banners: Array.isArray(settings.banners) ? settings.banners : [],
  vouchers: Array.isArray(settings.vouchers) ? settings.vouchers : [],
  categories: Array.isArray(settings.categories) ? settings.categories : [],
  categoryLabels: (settings.categoryLabels && typeof settings.categoryLabels === 'object' && !Array.isArray(settings.categoryLabels)) ? settings.categoryLabels : {},
  telegramLinks: Array.isArray(settings.telegramLinks) ? settings.telegramLinks.map((link, idx) => ({
    id: link.id || idx + 1,
    title: toCleanString(link.title, `Telegram ${idx + 1}`),
    url: toCleanString(link.url, '')
  })) : [],
  whatsappLinks: Array.isArray(settings.whatsappLinks) ? settings.whatsappLinks.map((link, idx) => ({
    id: link.id || idx + 1,
    title: toCleanString(link.title, `WhatsApp ${idx + 1}`),
    url: toCleanString(link.url, '')
  })) : [],
  footerLinks: Array.isArray(settings.footerLinks) ? settings.footerLinks : [
    { section: 'INFORMASI', links: [
      { id: 1, title: 'CARA BELI', url: '/cara-beli' },
      { id: 2, title: 'BANTUAN / FAQ', url: '/faq' },
      { id: 3, title: 'SYARAT KETENTUAN', url: '/syarat-ketentuan' }
    ]},
    { section: 'LAYANAN', links: [
      { id: 4, title: 'PRODUK POPULER', url: '/' },
      { id: 5, title: 'CEK RIWAYAT', url: '/invoice' }
    ]}
  ],
  pakasir: {
    apiKey: toCleanString(settings.pakasir?.apiKey, ''),
    project: toCleanString(settings.pakasir?.project, ''),
    mode: toCleanString(settings.pakasir?.mode, 'production')
  }
});

initDB('products.json', [
  {
    id: '1',
    name: 'Drip Client Non Root',
    category: 'freefire',
    pricingOptions: [
      { days: 1, price: 15000 },
      { days: 3, price: 30000 },
      { days: 7, price: 60000 }
    ],
    price1day: 15000,
    price3day: 30000,
    price7day: 60000,
    customPrices: {},
    image: '/images/freefire.jpg',
    description: 'Mod menu Free Fire dengan fitur lengkap, undetectable, dan performa stabil.',
    status: 'active',
    keys: ['KEY-FF-001', 'KEY-FF-002', 'KEY-FF-003'],
    createdAt: new Date().toISOString()
  },
  {
    id: '2',
    name: 'Prime Hook Non Root',
    category: 'freefire',
    pricingOptions: [
      { days: 1, price: 20000 },
      { days: 3, price: 40000 },
      { days: 7, price: 80000 }
    ],
    price1day: 20000,
    price3day: 40000,
    price7day: 80000,
    customPrices: {},
    image: '/images/freefire2.jpg',
    description: 'Premium hook script dengan aimbot dan wallhack. Anti banned system.',
    status: 'active',
    keys: ['KEY-PH-001', 'KEY-PH-002'],
    createdAt: new Date().toISOString()
  },
  {
    id: '3',
    name: 'HG Chert No Root',
    category: 'freefire',
    pricingOptions: [
      { days: 1, price: 10000 },
      { days: 3, price: 25000 },
      { days: 7, price: 50000 }
    ],
    price1day: 10000,
    price3day: 25000,
    price7day: 50000,
    customPrices: {},
    image: '/images/freefire3.jpg',
    description: 'HG Cheat dengan fitur auto headshot dan smooth aim.',
    status: 'active',
    keys: ['KEY-HG-001', 'KEY-HG-002', 'KEY-HG-003', 'KEY-HG-004'],
    createdAt: new Date().toISOString()
  },
  {
    id: '4',
    name: 'MLBB Mod Menu',
    category: 'mlbb',
    pricingOptions: [
      { days: 1, price: 0 },
      { days: 3, price: 0 },
      { days: 7, price: 0 }
    ],
    price1day: 0,
    price3day: 0,
    price7day: 0,
    customPrices: {},
    image: '/images/mlbb.jpg',
    description: 'Coming Soon',
    status: 'inactive',
    keys: [],
    createdAt: new Date().toISOString()
  },
  {
    id: '5',
    name: 'PUBG Mod Menu',
    category: 'pubg',
    pricingOptions: [
      { days: 1, price: 0 },
      { days: 3, price: 0 },
      { days: 7, price: 0 }
    ],
    price1day: 0,
    price3day: 0,
    price7day: 0,
    customPrices: {},
    image: '/images/pubg.jpg',
    description: 'Coming Soon',
    status: 'inactive',
    keys: [],
    createdAt: new Date().toISOString()
  }
]);

initDB('users.json', []);
initDB('transactions.json', []);
initDB('settings.json', {
  siteName: 'DMW STORE',
  gamePanelName: 'DMW STORE',
  about: 'DMW STORE adalah penyedia panel game premium untuk Free Fire, Mobile Legends, dan PUBG. Kami menyediakan mod menu berkualitas tinggi dengan harga terjangkau dan support 24 jam.\n\nKami telah dipercaya oleh ribuan gamers Indonesia dengan layanan cepat, key original, dan anti banned system yang handal.',
  faq: 'Q: Bagaimana cara membeli produk?\nA: Pilih produk yang diinginkan, pilih durasi, gunakan voucher jika ada, dan lakukan pembayaran via QRIS.\n\nQ: Bagaimana cara aktivasi setelah pembelian?\nA: Setelah pembayaran berhasil, key akan langsung diberikan dan bisa digunakan di aplikasi terkait.\n\n\nQ: Apakah aman dari banned?\nA: Produk kami dilengkapi anti banned system yang terus diupdate untuk keamanan maksimal.\n\nQ: Bagaimana jika ada masalah?\nA: Hubungi admin via WhatsApp atau Telegram yang tertera di halaman kontak.',
  contact: {
    whatsapp: '6281234567890',
    telegram: '@gamestore',
    email: 'support@gamestore.com'
  },
  banners: [
    { id: '1', image: '/images/banner_ff.jpg', title: 'Free Fire Panel', subtitle: 'Mod menu premium tersedia!', active: true }
  ],
  vouchers: [
    { code: 'WELCOME10', discountPercent: 10, minPurchase: 50000, active: true },
    { code: 'PROMO20', discountPercent: 20, minPurchase: 100000, active: true }
  ],
  telegramLinks: [
    { id: 1, title: 'Channel Utama', url: 'https://t.me/gamestore' },
    { id: 2, title: 'Grup Diskusi', url: 'https://t.me/gamestore_chat' },
    { id: 3, title: 'Support', url: 'https://t.me/gamestore_support' }
  ],
  adminCredentials: {
    username: 'dexxmewa2727',
    password: bcrypt.hashSync('angga270409', 10)
  },
  pakasir: {
    apiKey: '',
    project: '',
    mode: 'production'
  }
});

initDB('notifications.json', []);

const broadcastPurchase = (io, username, productName, productImage) => {
  const notifications = readDB('notifications.json');
  notifications.unshift({
    id: uuidv4(),
    username,
    productName,
    productImage: productImage || '/images/placeholder.jpg',
    createdAt: new Date().toISOString()
  });
  if (notifications.length > 50) notifications.length = 50;
  writeDB('notifications.json', notifications);
  if (io) {
    io.emit('new_purchase', notifications[0]);
  }
  console.log(`[BROADCAST] ${username} berhasil membeli ${productName}`);
};

const getUser = (userId) => {
  if (userId === 'admin') {
    return { id: 'admin', username: 'admin', isAdmin: true };
  }
  const users = readDB('users.json');
  return users.find(u => u.id === userId);
};

const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  const user = getUser(req.session.userId);
  if (!user?.isAdmin) {
    return res.redirect('/');
  }
  next();
};

app.use((req, res, next) => {
  res.locals.user = getUser(req.session.userId);
  res.locals.isAdmin = res.locals.user?.isAdmin || false;
  res.locals.currentPath = req.path;
  res.locals.settings = normalizeSettings(readDB('settings.json'));
  next();
});

app.get('/', (req, res) => {
  const products = normalizeProducts(readDB('products.json'));
  const settings = normalizeSettings(readDB('settings.json'));
  const activeProducts = products.filter(p => p.status === 'active');
  const banners = settings.banners.filter(b => b.active);

  res.render('pages/home', {
    products: activeProducts,
    banners: banners,
    settings,
    user: res.locals.user,
    isAdmin: res.locals.isAdmin
  });
});

app.get('/login', (req, res) => {
  if (req.session.userId) {
    const user = getUser(req.session.userId);
    return res.redirect(user?.isAdmin ? '/admin' : '/');
  }
  res.render('pages/login', { error: null });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const settings = normalizeSettings(readDB('settings.json'));

  if (username === settings.adminCredentials.username &&
      bcrypt.compareSync(password, settings.adminCredentials.password)) {
    req.session.userId = 'admin';
    return res.redirect('/admin');
  }

  const users = readDB('users.json');
  const user = users.find(u => u.username === username);
  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.userId = user.id;
    return res.redirect('/');
  }

  res.render('pages/login', { error: 'Username atau password salah' });
});

app.get('/register', (req, res) => {
  if (req.session.userId) return res.redirect('/');
  res.render('pages/register', { error: null });
});

const registerRateLimit = new Map();
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_WINDOW = 60 * 60 * 1000;

const checkRateLimit = (ip, userAgent) => {
  const key = `${ip}:${userAgent}`;
  const now = Date.now();
  const record = registerRateLimit.get(key);

  if (record) {
    const windowStart = now - RATE_LIMIT_WINDOW;
    const recentAttempts = record.filter(ts => ts > windowStart);
    if (recentAttempts.length >= RATE_LIMIT_MAX) {
      return false;
    }
    recentAttempts.push(now);
    registerRateLimit.set(key, recentAttempts);
  } else {
    registerRateLimit.set(key, [now]);
  }

  setTimeout(() => {
    const key = `${ip}:${userAgent}`;
    const record = registerRateLimit.get(key);
    if (record) {
      const windowStart = Date.now() - RATE_LIMIT_WINDOW;
      record = record.filter(ts => ts > windowStart);
      if (record.length === 0) {
        registerRateLimit.delete(key);
      }
    }
  }, RATE_LIMIT_WINDOW);

  return true;
};

app.post('/register', (req, res) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.get('User-Agent') || 'unknown';

  if (!checkRateLimit(ip, userAgent)) {
    return res.render('pages/register', { error: 'Terlalu banyak percobaan daftar. Silakan coba lagi dalam 1 jam.' });
  }

  const { username, password } = req.body;
  const users = readDB('users.json');

  if (users.find(u => u.username === username)) {
    return res.render('pages/register', { error: 'Username sudah digunakan' });
  }

  const newUser = {
    id: uuidv4(),
    username,
    password: bcrypt.hashSync(password, 10),
    isAdmin: false,
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeDB('users.json', users);

  req.session.userId = newUser.id;
  res.redirect('/');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.get('/buy/:id', requireAuth, (req, res) => {
  const products = normalizeProducts(readDB('products.json'));
  const product = products.find(p => p.id === req.params.id);

  if (!product || product.status !== 'active') {
    return res.redirect('/');
  }

  const settings = normalizeSettings(readDB('settings.json'));
  res.render('pages/buy', { product, user: res.locals.user, settings, error: null });
});

app.post('/buy/:id', requireAuth, (req, res) => {
  const { duration, voucher, paymentMethod } = req.body;
  const products = normalizeProducts(readDB('products.json'));
  const product = products.find(p => p.id === req.params.id);

  if (!product || product.status !== 'active') {
    return res.redirect('/');
  }

  const user = getUser(req.session.userId);
  const pricingOptions = getPricingOptions(product);
  const selectedOption = pricingOptions.find((option) => option.days.toString() === duration) || pricingOptions[0];
  const price = selectedOption?.price || 0;
  const durationLabel = `${selectedOption?.days || 1} Hari`;

  let discount = 0;
  let voucherData = null;
  if (voucher) {
    const settings = normalizeSettings(readDB('settings.json'));
    const validVoucher = settings.vouchers?.find(v => v.code === voucher.toUpperCase() && v.active);
    if (validVoucher && price >= validVoucher.minPurchase) {
      discount = Math.round(price * (validVoucher.discountPercent / 100));
      voucherData = validVoucher;
    }
  }

  const finalPrice = price - discount;

  if (finalPrice > 0 && paymentMethod === 'qris') {
    const settings = normalizeSettings(readDB('settings.json'));

    if (settings.pakasir?.apiKey && settings.pakasir?.project) {
      const orderId = `GS-${Date.now()}`;
      const transactionData = {
        order_id: orderId,
        amount: finalPrice
      };

      createPakasirPayment(transactionData, (err, paymentResult) => {
        if (err) {
          return res.render('pages/buy', { product, user, settings, error: 'Gagal menghubungi server pembayaran. Silakan coba lagi.' });
        }

        if (!paymentResult?.payment?.payment_number) {
          return res.render('pages/buy', { product, user, settings, error: 'Pembayaran gagal dibuat. Silakan coba lagi.' });
        }

        const transactions = readDB('transactions.json');
        const transaction = {
          id: uuidv4(),
          userId: user.id,
          username: user.username,
          productId: product.id,
          productName: product.name,
          duration: durationLabel,
          price: finalPrice,
          originalPrice: price,
          discount,
          voucherCode: voucher || null,
          voucherData,
          key: '',
          status: 'pending',
          paymentMethod: 'qris',
          paymentRef: orderId,
          paymentQr: paymentResult.payment.payment_number,
          createdAt: new Date().toISOString()
        };

        transactions.push(transaction);
        writeDB('transactions.json', transactions);

        res.render('pages/buy-success', { transaction, product, pendingPayment: true, paymentQr: paymentResult.payment.payment_number, totalPayment: paymentResult.payment.total_payment });
      });
    } else {
      return res.render('pages/buy', { product, user, settings, error: 'Metode pembayaran belum dikonfigurasi. Pastikan API Key dan Project Slug sudah diisi di admin.' });
    }
  } else {
    let key = '';

    const selectedDays = parseInt(duration, 10);

    if (product.keys && product.keys.length > 0) {
      const keyedKey = product.keys.find(k => {
        const parts = k.split(':');
        return parts.length === 2 && parseInt(parts[1], 10) === selectedDays;
      });

      if (keyedKey) {
        key = keyedKey.split(':')[0];
        const idx = products.findIndex(p => p.id === req.params.id);
        if (idx !== -1) {
          products[idx].keys = products[idx].keys.filter(k => k !== keyedKey);
          writeDB('products.json', products);
        }
      } else {
        const unkeyedKey = product.keys.find(k => !k.includes(':'));
        if (unkeyedKey) {
          key = unkeyedKey;
          const idx = products.findIndex(p => p.id === req.params.id);
          if (idx !== -1) {
            products[idx].keys = products[idx].keys.filter(k => k !== unkeyedKey);
            writeDB('products.json', products);
          }
        }
      }
    }

    if (!key) {
      key = `GS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
    }

    const transactions = readDB('transactions.json');
    const invoiceId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const transaction = {
      id: uuidv4(),
      userId: user.id,
      username: user.username,
      productId: product.id,
      productName: product.name,
      duration: durationLabel,
      price: finalPrice,
      originalPrice: price,
      discount,
      voucherCode: voucher || null,
      voucherData,
      key,
      invoiceId: invoiceId,
      status: 'completed',
      paymentMethod: finalPrice > 0 ? 'manual' : 'free',
      createdAt: new Date().toISOString(),
      paidAt: new Date().toISOString()
    };

    transactions.push(transaction);
    writeDB('transactions.json', transactions);

    const directProductIdx = products.findIndex(p => p.id === product.id);
    if (directProductIdx !== -1) {
      products[directProductIdx].sold = (products[directProductIdx].sold || 0) + 1;
      writeDB('products.json', products);
    }

    broadcastPurchase(io, user.username, product.name, product.image);

    res.render('pages/buy-success', { transaction, product });
  }
});

function createPakasirPayment(data, callback) {
  const settings = normalizeSettings(readDB('settings.json'));
  const apiKey = settings.pakasir?.apiKey;
  const project = settings.pakasir?.project;

  if (!apiKey || !project || apiKey.trim() === '' || project.trim() === '') {
    const error = new Error('PAKASIR API Key atau Project Slug belum dikonfigurasi');
    console.error('[PAKASIR] Create payment error:', error.message);
    return callback(error, null);
  }

  const postData = JSON.stringify({
    project: project,
    order_id: data.order_id,
    amount: data.amount,
    api_key: apiKey
  });

  console.log(`[PAKASIR] Creating payment for order: ${data.order_id}, amount: ${data.amount}`);

  const req = https.request({
    hostname: 'app.pakasir.com',
    port: 443,
    path: '/api/transactioncreate/qris',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 15000 // 15 second timeout
  }, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log(`[PAKASIR] Create payment response status: ${res.statusCode}`);

      if (res.statusCode !== 200 && res.statusCode !== 201) {
        console.error('[PAKASIR] Create payment failed - Status:', res.statusCode, 'Body:', body);
        return callback(new Error(`Pakasir API error (${res.statusCode}): ${body}`), null);
      }

      if (!body || body.trim() === '') {
        console.error('[PAKASIR] Create payment failed - Empty response body');
        return callback(new Error('Pakasir API returned empty response'), null);
      }

      try {
        const result = JSON.parse(body);

        // Check for various payment response formats
        const paymentNumber = result.payment?.payment_number || result.payment_number || result.qr_string || result.data?.payment_number;

        if (!paymentNumber) {
          console.error('[PAKASIR] Create payment failed - No payment number in response:', JSON.stringify(result));
          return callback(new Error(`Pakasir error: ${JSON.stringify(result)}`), null);
        }

        console.log(`[PAKASIR] Create payment success, payment number:`, paymentNumber);

        // Normalize response format
        const normalizedResult = {
          payment: {
            payment_number: paymentNumber,
            total_payment: result.payment?.total_payment || result.total_payment || result.data?.total_payment || data.amount
          }
        };

        callback(null, normalizedResult);
      } catch (e) {
        console.error('[PAKASIR] Parse error:', e.message, 'Body:', body);
        callback(new Error(`Failed to parse Pakasir response: ${e.message}`), null);
      }
    });
  });

  req.on('timeout', () => {
    console.error('[PAKASIR] Create payment request timeout');
    req.destroy();
    callback(new Error('Pakasir API request timeout'), null);
  });

  req.on('error', (e) => {
    console.error('[PAKASIR] Create payment request error:', e.message, e.code);
    callback(new Error(`Network error: ${e.message}`), null);
  });

  req.write(postData);
  req.end();
}

app.post('/check-payment/:refId', requireAuth, (req, res) => {
  const settings = normalizeSettings(readDB('settings.json'));
  const apiKey = settings.pakasir?.apiKey;
  const project = settings.pakasir?.project;

  console.log('===========================================');
  console.log('[CHECK-PAYMENT] ===== STARTING CHECK =====');
  console.log('[CHECK-PAYMENT] refId:', req.params.refId);
  console.log('[CHECK-PAYMENT] apiKey configured:', !!apiKey, apiKey ? '(len=' + apiKey.length + ')' : '');
  console.log('[CHECK-PAYMENT] project configured:', !!project, project ? '(' + project + ')' : '');
  console.log('===========================================');

  const transactions = readDB('transactions.json');
  const transactionIdx = transactions.findIndex(t => t.paymentRef === req.params.refId);

  if (transactionIdx === -1) {
    console.error('[CHECK-PAYMENT] Transaction not found:', req.params.refId);
    console.log('Available paymentRefs:', transactions.map(t => t.paymentRef).slice(0, 5));
    return res.json({ success: false, status: 'not_found', message: 'Transaksi tidak ditemukan' });
  }

  const transaction = transactions[transactionIdx];
  console.log('[CHECK-PAYMENT] Transaction found:', {
    id: transaction.id,
    paymentRef: transaction.paymentRef,
    status: transaction.status,
    price: transaction.price,
    totalPayment: transaction.totalPayment
  });

  if (transaction.status === 'completed') {
    console.log('[CHECK-PAYMENT] Transaction already completed:', transaction.id);
    return res.json({ success: true, status: 'completed', key: transaction.key });
  }

  if (transaction.status === 'expired') {
    console.log('[CHECK-PAYMENT] Transaction already expired:', transaction.id);
    return res.json({ success: false, status: 'expired', message: 'Pembayaran telah kadaluarsa' });
  }

  if (transaction.status === 'cancelled') {
    console.log('[CHECK-PAYMENT] Transaction already cancelled:', transaction.id);
    return res.json({ success: false, status: 'cancelled', message: 'Pembayaran telah dibatalkan' });
  }

  const now = new Date();
  if (transaction.expiredAt && new Date(transaction.expiredAt) < now) {
    transactions[transactionIdx].status = 'expired';
    writeDB('transactions.json', transactions);
    console.log('[CHECK-PAYMENT] Transaction expired by time:', transaction.id);
    return res.json({ success: false, status: 'expired', message: 'Pembayaran telah kadaluarsa' });
  }

  // Check if pakasir is configured
  const isPakasirConfigured = apiKey && project && apiKey.trim() !== '' && project.trim() !== '';
  console.log('[CHECK-PAYMENT] Pakasir configured:', isPakasirConfigured);

  if (!isPakasirConfigured) {
    console.log('[CHECK-PAYMENT] Pakasir API not configured!');
    return res.json({
      success: false,
      status: 'not_configured',
      message: 'Metode pembayaran QRIS belum aktif. Silakan hubungi admin untuk konfirmasi manual.'
    });
  }

  // Determine the correct amount to use
  const checkAmount = transaction.totalPayment || transaction.price;
  console.log('[CHECK-PAYMENT] Checking with amount:', checkAmount);

  checkPakasirStatus(transaction.paymentRef, checkAmount, apiKey, project, (err, result) => {
    if (err) {
      console.error('[CHECK-PAYMENT] Pakasir API error:', err.message);
      return res.json({
        success: false,
        status: 'api_error',
        message: 'Gagal terhubung ke server pembayaran. Silakan coba beberapa saat lagi atau hubungi admin.'
      });
    }

    if (!result) {
      console.error('[CHECK-PAYMENT] Pakasir returned null/undefined result');
      return res.json({
        success: false,
        status: 'api_error',
        message: 'Server pembayaran tidak merespon. Silakan coba beberapa saat lagi.'
      });
    }

    console.log('[CHECK-PAYMENT] Pakasir response:', JSON.stringify(result));

    // Handle various Pakasir response formats
    let txStatus = null;

    // Format 1: { transaction: { status: 'xxx' } }
    if (result.transaction && result.transaction.status) {
      txStatus = result.transaction.status;
      console.log('[CHECK-PAYMENT] Status from result.transaction.status:', txStatus);
    }
    // Format 2: { status: 'xxx' }
    else if (result.status) {
      txStatus = result.status;
      console.log('[CHECK-PAYMENT] Status from result.status:', txStatus);
    }
    // Format 3: { data: { status: 'xxx' } }
    else if (result.data && result.data.status) {
      txStatus = result.data.status;
      console.log('[CHECK-PAYMENT] Status from result.data.status:', txStatus);
    }
    // Format 4: { success: true/false }
    else if (typeof result.success !== 'undefined') {
      txStatus = result.success ? 'completed' : 'pending';
      console.log('[CHECK-PAYMENT] Status from result.success:', txStatus);
    }

    console.log('[CHECK-PAYMENT] Final parsed txStatus:', txStatus);

    // Handle expired status variations
    if (txStatus && (txStatus === 'expired' || txStatus === 'EXPIRED' || txStatus === 'canceled' || txStatus === 'CANCELLED')) {
      transactions[transactionIdx].status = 'expired';
      writeDB('transactions.json', transactions);
      console.log('[CHECK-PAYMENT] Transaction marked as expired:', transaction.id);
      return res.json({ success: false, status: 'expired', message: 'Pembayaran telah kadaluarsa' });
    }

    // Handle completed status
    if (txStatus && (txStatus === 'completed' || txStatus === 'COMPLETED' || txStatus === 'success' || txStatus === 'SUCCESS' || txStatus === 'paid' || txStatus === 'PAID')) {
      let products = normalizeProducts(readDB('products.json'));
      const product = products.find(p => p.id === transaction.productId);

      let key = transaction.key;
      if (!key && product && product.keys && product.keys.length > 0) {
        const durationStr = transaction.duration || '1';
        const selectedDays = parseInt(durationStr, 10) || 1;

        const keyedKey = product.keys.find(k => {
          const parts = k.split(':');
          return parts.length === 2 && parseInt(parts[1], 10) === selectedDays;
        });

        if (keyedKey) {
          key = keyedKey.split(':')[0];
          const prodIdx = products.findIndex(p => p.id === transaction.productId);
          if (prodIdx !== -1) {
            products[prodIdx].keys = products[prodIdx].keys.filter(k => k !== keyedKey);
            writeDB('products.json', products);
          }
        } else {
          const unkeyedKey = product.keys.find(k => !k.includes(':'));
          if (unkeyedKey) {
            key = unkeyedKey;
            const prodIdx = products.findIndex(p => p.id === transaction.productId);
            if (prodIdx !== -1) {
              products[prodIdx].keys = products[prodIdx].keys.filter(k => k !== unkeyedKey);
              writeDB('products.json', products);
            }
          }
        }
      }

      if (!key) {
        key = `GS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      }

      const invoiceId = `INV-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      transactions[transactionIdx].status = 'completed';
      transactions[transactionIdx].key = key;
      transactions[transactionIdx].invoiceId = invoiceId;
      transactions[transactionIdx].paidAt = new Date().toISOString();
      writeDB('transactions.json', transactions);

      const soldProductIdx = products.findIndex(p => p.id === transaction.productId);
      if (soldProductIdx !== -1) {
        products[soldProductIdx].sold = (products[soldProductIdx].sold || 0) + 1;
        writeDB('products.json', products);
      }

      broadcastPurchase(io, transaction.username, transaction.productName, transaction.productImage || product?.image);

      console.log('[PAYMENT] Transaction', transaction.id, 'marked as COMPLETED. Key:', key);

      return res.json({ success: true, status: 'completed', key: key });
    }

    // Payment still pending
    console.log('[CHECK-PAYMENT] Payment still pending for transaction:', transaction.id);
    return res.json({
      success: false,
      status: 'pending',
      message: 'Pembayaran masih menunggu. Silakan selesaikan pembayaran dan cek beberapa saat lagi.'
    });
  });
});

app.post('/cancel-payment/:refId', requireAuth, (req, res) => {
  const transactions = readDB('transactions.json');
  const user = getUser(req.session.userId);
  const transactionIdx = transactions.findIndex(t => t.paymentRef === req.params.refId);

  if (transactionIdx === -1) {
    return res.json({ success: false, message: 'Transaction not found' });
  }

  const transaction = transactions[transactionIdx];

  if (user.id !== transaction.userId && !user.isAdmin) {
    return res.json({ success: false, message: 'Unauthorized' });
  }

  if (transaction.status !== 'pending') {
    return res.json({ success: false, message: 'Hanya pembayaran pending yang bisa dibatalkan' });
  }

  transactions[transactionIdx].status = 'cancelled';
  writeDB('transactions.json', transactions);

  console.log(`[CANCEL] Transaction ${transaction.id} cancelled by ${user.username}`);
  return res.json({ success: true, message: 'Pembayaran berhasil dibatalkan' });
});

function checkPakasirStatus(orderId, amount, apiKey, project, callback) {
  // Validate all required parameters
  if (!apiKey || !project || !orderId) {
    console.error('[PAKASIR] Missing required parameters for status check');
    return callback(new Error('Missing required parameters: apiKey, project, or orderId'), null);
  }

  // Ensure amount is a valid number
  const amountNum = parseInt(amount, 10);
  if (isNaN(amountNum) || amountNum <= 0) {
    console.error('[PAKASIR] Invalid amount:', amount);
    return callback(new Error('Invalid amount value'), null);
  }

  const query = `project=${encodeURIComponent(project)}&amount=${amountNum}&order_id=${encodeURIComponent(orderId)}&api_key=${encodeURIComponent(apiKey)}`;

  console.log(`[PAKASIR] Checking status for order: ${orderId}, amount: ${amountNum}`);
  console.log(`[PAKASIR] API URL: https://app.pakasir.com/api/transactiondetail?${query}`);

  const options = {
    hostname: 'app.pakasir.com',
    port: 443,
    path: `/api/transactiondetail?${query}`,
    method: 'GET',
    timeout: 10000
  };

  console.log(`[PAKASIR] Request options:`, JSON.stringify({ hostname: options.hostname, path: options.path, method: options.method }));

  const req = https.request(options, (res) => {
    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
      console.log(`[PAKASIR] Response status code: ${res.statusCode}, body length: ${body.length}`);

      if (res.statusCode !== 200) {
        console.error('[PAKASIR] Non-200 response:', res.statusCode, body);
        const error = new Error(`Pakasir API returned status ${res.statusCode}`);
        return callback(error, null);
      }

      if (!body || body.trim() === '') {
        console.error('[PAKASIR] Empty response body');
        const error = new Error('Pakasir API returned empty response');
        return callback(error, null);
      }

      try {
        const result = JSON.parse(body);
        console.log('[PAKASIR] Full response:', JSON.stringify(result));
        callback(null, result);
      } catch (e) {
        console.error('[PAKASIR] Parse error:', e.message, 'Body:', body);
        const parseError = new Error(`Failed to parse Pakasir response: ${e.message}`);
        callback(parseError, null);
      }
    });
  });

  req.on('timeout', () => {
    console.error('[PAKASIR] Request timeout');
    req.destroy();
    callback(new Error('Pakasir API request timeout'), null);
  });

  req.on('error', (e) => {
    console.error('[PAKASIR] Request error:', e.message, e.code);
    const networkError = new Error(`Network error: ${e.message}`);
    callback(networkError, null);
  });

  req.end();
}

app.get('/invoice', requireAuth, (req, res) => {
  const searchQuery = req.query.q || '';
  const transactions = readDB('transactions.json');
  const user = getUser(req.session.userId);

  let userTransactions = transactions
    .filter(t => t.userId === user.id || user.isAdmin)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  let filteredTransactions = userTransactions;
  if (searchQuery) {
    const query = searchQuery.toLowerCase().trim();
    filteredTransactions = userTransactions.filter(t => {
      const invoiceId = (t.invoiceId || t.id || '').toLowerCase();
      const key = (t.key || '').toLowerCase();
      const productName = (t.productName || '').toLowerCase();
      const paymentRef = (t.paymentRef || '').toLowerCase();
      return invoiceId.includes(query) || key.includes(query) || productName.includes(query) || paymentRef.includes(query);
    });
  }

  const pendingTransactions = userTransactions.filter(t => t.status === 'pending');
  const pendingRefs = pendingTransactions.map(t => t.paymentRef).filter(r => r);

  res.render('pages/invoice', {
    transactions: filteredTransactions,
    searchQuery: searchQuery,
    isSpecific: !!searchQuery,
    pendingCount: pendingTransactions.length,
    pendingRefs: pendingRefs,
    user
  });
});

app.get('/invoice/:id', requireAuth, (req, res) => {
  const transactions = readDB('transactions.json');
  const user = getUser(req.session.userId);

  const transaction = transactions.find(t => {
    const isOwner = t.userId === user.id || user.isAdmin;
    if (!isOwner) return false;
    return (t.invoiceId || t.id) === req.params.id || t.id === req.params.id || t.key === req.params.id;
  });

  if (!transaction) {
    return res.redirect('/invoice');
  }

  const pendingRefs = transaction.status === 'pending' && transaction.paymentRef ? [transaction.paymentRef] : [];

  res.render('pages/invoice', {
    transactions: [transaction],
    searchQuery: req.params.id,
    pendingCount: transaction.status === 'pending' ? 1 : 0,
    pendingRefs: pendingRefs,
    user,
    isSpecific: true
  });
});

app.get('/history', requireAuth, (req, res) => {
  const transactions = readDB('transactions.json');
  const user = getUser(req.session.userId);

  const userTransactions = transactions
    .filter(t => t.userId === user.id || user.isAdmin)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.render('pages/history', {
    transactions: userTransactions,
    isAdmin: user.isAdmin,
    user
  });
});

app.get('/cara-beli', (req, res) => {
  const settings = normalizeSettings(readDB('settings.json'));
  res.render('pages/cara-beli', { settings });
});

app.get('/faq', (req, res) => {
  const settings = normalizeSettings(readDB('settings.json'));
  res.render('pages/faq', { settings });
});

app.get('/syarat-ketentuan', (req, res) => {
  const settings = normalizeSettings(readDB('settings.json'));
  res.render('pages/syarat-ketentuan', { settings });
});

app.get('/top-buyers', (req, res) => {
  const transactions = readDB('transactions.json');

  const topBuyers = {};
  transactions.filter(t => t.status === 'completed').forEach(t => {
    if (!topBuyers[t.userId]) {
      topBuyers[t.userId] = { userId: t.userId, username: t.username, totalSpent: 0, count: 0 };
    }
    topBuyers[t.userId].totalSpent += t.price;
    topBuyers[t.userId].count += 1;
  });

  const sorted = Object.values(topBuyers)
    .sort((a, b) => b.count - a.count || b.totalSpent - a.totalSpent)
    .slice(0, 10);

  res.render('pages/top-buyers', {
    topBuyers: sorted,
    user: res.locals.user,
    isAdmin: res.locals.isAdmin
  });
});

app.get('/admin', requireAdmin, (req, res) => {
  const products = normalizeProducts(readDB('products.json'));
  const transactions = readDB('transactions.json');
  const users = readDB('users.json');
  const settings = normalizeSettings(readDB('settings.json'));

  // Flash messages dari redirect kategori
  let categorySuccess = null;
  if (req.query.success === 'added' && req.query.label) {
    categorySuccess = `Kategori "${decodeURIComponent(req.query.label)}" berhasil ditambahkan!`;
  } else if (req.query.success === 'deleted') {
    categorySuccess = 'Kategori berhasil dihapus.';
  }

  res.render('pages/admin', {
    products,
    transactions,
    users: users.filter(u => !u.isAdmin),
    settings,
    user: res.locals.user,
    error: null,
    broadcastSuccess: null,
    categorySuccess
  });
});

app.post('/admin/products', requireAdmin, upload.single('image'), (req, res) => {
  const { name, category, description, status, keys, pricingDays, pricingPrices, newCategory } = req.body;

  let settings = normalizeSettings(readDB('settings.json'));
  let finalCategory = toCleanString(category);
  if (category === '__new__' && newCategory) {
    const slug = toCleanString(newCategory).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (slug && !settings.categories) settings.categories = [];
    if (slug && settings.categories && !settings.categories.includes(slug)) {
      settings.categories.push(slug);
      writeDB('settings.json', settings);
    }
    finalCategory = slug || finalCategory;
  }

  const products = normalizeProducts(readDB('products.json'));

  const keyArray = keys ? keys.split('\n').map(k => k.trim()).filter(k => k) : [];
  const parsedPricingOptions = parsePricingOptionsInput(pricingDays, pricingPrices);

  const newProduct = {
    id: uuidv4(),
    name: toCleanString(name),
    category: finalCategory,
    description: description || '',
    image: req.file ? `/uploads/products/${req.file.filename}` : '/images/placeholder.jpg',
    status: status === 'active' ? 'active' : 'inactive',
    keys: keyArray,
    createdAt: new Date().toISOString()
  };

  applyPricingOptions(newProduct, parsedPricingOptions);

  products.push(newProduct);
  writeDB('products.json', products);

  res.redirect('/admin');
});

app.post('/admin/products/:id', requireAdmin, upload.single('image'), (req, res) => {
  const { name, category, description, status, keys, pricingDays, pricingPrices, newCategory } = req.body;

  let settings = normalizeSettings(readDB('settings.json'));
  let finalCategory = toCleanString(category);
  if (category === '__new__' && newCategory) {
    const slug = toCleanString(newCategory).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (slug && !settings.categories) settings.categories = [];
    if (slug && settings.categories && !settings.categories.includes(slug)) {
      settings.categories.push(slug);
      writeDB('settings.json', settings);
    }
    finalCategory = slug || finalCategory;
  }

  const products = normalizeProducts(readDB('products.json'));
  const product = products.find(p => p.id === req.params.id);

  if (product) {
    product.name = toCleanString(name);
    product.category = finalCategory;
    product.description = description || '';
    product.status = status === 'active' ? 'active' : 'inactive';
    product.keys = keys ? keys.split('\n').map(k => k.trim()).filter(k => k) : [];
    applyPricingOptions(product, parsePricingOptionsInput(pricingDays, pricingPrices));

    if (req.file) {
      if (product.image && product.image !== '/images/placeholder.jpg') {
        const oldImagePath = path.join(__dirname, 'public', product.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      product.image = `/uploads/products/${req.file.filename}`;
    }

    writeDB('products.json', products);
  }

  res.redirect('/admin');
});

app.post('/admin/products/:id/toggle', requireAdmin, (req, res) => {
  const products = normalizeProducts(readDB('products.json'));
  const product = products.find(p => p.id === req.params.id);

  if (product) {
    product.status = product.status === 'active' ? 'inactive' : 'active';
    writeDB('products.json', products);
  }

  res.redirect('/admin');
});

app.post('/admin/products/:id/delete', requireAdmin, (req, res) => {
  let products = normalizeProducts(readDB('products.json'));
  products = products.filter(p => p.id !== req.params.id);
  writeDB('products.json', products);

  res.redirect('/admin');
});

app.post('/admin/transactions/:id/status', requireAdmin, (req, res) => {
  const { status } = req.body;
  const transactions = readDB('transactions.json');
  const transaction = transactions.find(t => t.id === req.params.id);

  if (transaction) {
    if (status === 'completed' && !transaction.key) {
      let products = normalizeProducts(readDB('products.json'));
      const product = products.find(p => p.id === transaction.productId);

      if (product && product.keys.length > 0) {
        transaction.key = product.keys.shift();
        const prodIdx = products.findIndex(p => p.id === transaction.productId);
        if (prodIdx !== -1) {
          products[prodIdx] = product;
          writeDB('products.json', products);
        }
      } else {
        transaction.key = `GS-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      }
    }

    transaction.status = status;
    if (status === 'completed') {
      transaction.paidAt = new Date().toISOString();
      let adminProducts = normalizeProducts(readDB('products.json'));
      const adminProdIdx = adminProducts.findIndex(p => p.id === transaction.productId);
      if (adminProdIdx !== -1) {
        adminProducts[adminProdIdx].sold = (adminProducts[adminProdIdx].sold || 0) + 1;
        writeDB('products.json', adminProducts);
      }
      broadcastPurchase(io, transaction.username, transaction.productName, transaction.productImage || product?.image);
    }
    writeDB('transactions.json', transactions);
  }

  res.redirect('/admin');
});

app.post('/admin/broadcast', requireAdmin, (req, res) => {
  const { subject, message } = req.body;

  const successMessage = `Broadcast berhasil dikirim ke semua user: "${subject}"`;

  const products = normalizeProducts(readDB('products.json'));
  const transactions = readDB('transactions.json');
  const users = readDB('users.json');
  const settings = normalizeSettings(readDB('settings.json'));

  res.render('pages/admin', {
    products,
    transactions,
    users: users.filter(u => !u.isAdmin),
    settings,
    user: res.locals.user,
    error: null,
    broadcastSuccess: successMessage
  });
});

app.post('/admin/settings', requireAdmin, (req, res) => {
  const { whatsapp, telegram, email, siteName, gamePanelName, section, about, faq, marqueeText } = req.body;
  let settings = normalizeSettings(readDB('settings.json'));

  if (section === 'about') {
    settings.about = toCleanString(about || '');
  } else if (section === 'faq') {
    settings.faq = toCleanString(faq || '');
  } else if (section === 'marquee') {
    settings.marqueeText = toCleanString(marqueeText || '');
  } else {
    settings.contact = {
      whatsapp: whatsapp !== undefined ? toCleanString(whatsapp) : settings.contact.whatsapp,
      telegram: telegram !== undefined ? toCleanString(telegram) : settings.contact.telegram,
      email: email !== undefined ? toCleanString(email) : settings.contact.email
    };
    settings.siteName = toCleanString(siteName, 'DMW STORE') || 'DMW STORE';
    settings.gamePanelName = toCleanString(gamePanelName, 'DMW STORE') || 'DMW STORE';
  }

  writeDB('settings.json', settings);

  res.redirect('/admin');
});

app.post('/admin/credentials', requireAdmin, (req, res) => {
  res.redirect('/admin');
});

app.post('/admin/pakasir', requireAdmin, (req, res) => {
  const { apiKey, project, mode } = req.body;
  const settings = normalizeSettings(readDB('settings.json'));

  settings.pakasir = {
    apiKey: toCleanString(apiKey),
    project: toCleanString(project),
    mode: mode === 'sandbox' ? 'sandbox' : 'production'
  };
  writeDB('settings.json', settings);

  res.redirect('/admin');
});

app.post('/admin/vouchers', requireAdmin, (req, res) => {
  const { code, discountPercent, minPurchase, active } = req.body;
  const settings = normalizeSettings(readDB('settings.json'));

  if (!settings.vouchers) settings.vouchers = [];

  const existingIndex = settings.vouchers.findIndex(v => v.code === code.toUpperCase());

  if (existingIndex !== -1) {
    settings.vouchers[existingIndex].discountPercent = parseInt(discountPercent) || 0;
    settings.vouchers[existingIndex].minPurchase = parseInt(minPurchase) || 0;
    settings.vouchers[existingIndex].active = active === 'true';
  } else {
    settings.vouchers.push({
      code: code.toUpperCase(),
      discountPercent: parseInt(discountPercent) || 0,
      minPurchase: parseInt(minPurchase) || 0,
      active: true
    });
  }

  writeDB('settings.json', settings);
  res.redirect('/admin');
});

app.post('/admin/vouchers/:code/delete', requireAdmin, (req, res) => {
  const settings = normalizeSettings(readDB('settings.json'));
  settings.vouchers = settings.vouchers.filter(v => v.code !== req.params.code);
  writeDB('settings.json', settings);
  res.redirect('/admin');
});

app.post('/admin/categories', requireAdmin, (req, res) => {
  const { categoryName, categoryLabel } = req.body;
  const settings = normalizeSettings(readDB('settings.json'));

  // Gunakan categoryName jika diisi, atau generate slug dari categoryLabel
  const rawSlug = (categoryName && categoryName.trim()) ? categoryName.trim() : (categoryLabel || '');
  const slug = rawSlug.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (!slug) {
    return res.redirect('/admin?tab=categories&error=slug_empty');
  }

  const defaultCats = ['freefire', 'mlbb', 'pubg'];
  if (defaultCats.includes(slug)) {
    return res.redirect('/admin?tab=categories&error=default_cat');
  }

  if (!settings.categories) settings.categories = [];
  if (!settings.categoryLabels) settings.categoryLabels = {};

  if (settings.categories.includes(slug)) {
    return res.redirect('/admin?tab=categories&error=duplicate');
  }

  settings.categories.push(slug);

  // Simpan label tampilan
  const label = (categoryLabel && categoryLabel.trim()) ? categoryLabel.trim() : (slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '));
  settings.categoryLabels[slug] = label;

  writeDB('settings.json', settings);

  res.redirect('/admin?tab=categories&success=added&label=' + encodeURIComponent(label));
});

app.post('/admin/categories/:slug/delete', requireAdmin, (req, res) => {
  const settings = normalizeSettings(readDB('settings.json'));
  const defaultCats = ['freefire', 'mlbb', 'pubg'];

  if (defaultCats.includes(req.params.slug)) {
    return res.redirect('/admin?tab=categories');
  }

  settings.categories = (settings.categories || []).filter(c => c !== req.params.slug);

  // Hapus juga label-nya
  if (settings.categoryLabels && settings.categoryLabels[req.params.slug]) {
    delete settings.categoryLabels[req.params.slug];
  }

  writeDB('settings.json', settings);
  res.redirect('/admin?tab=categories&success=deleted');
});

app.post('/admin/users/:username/delete', requireAdmin, (req, res) => {
  const { username } = req.params;
  let users = readDB('users.json');

  // Tidak bisa hapus admin
  const targetUser = users.find(u => u.username === username);
  if (!targetUser || targetUser.isAdmin) {
    return res.redirect('/admin?tab=users');
  }

  users = users.filter(u => u.username !== username);
  writeDB('users.json', users);
  res.redirect('/admin?tab=users&success=user_deleted');
});

app.post('/admin/telegram-links', requireAdmin, (req, res) => {
  const { linkId, linkTitle, linkUrl, siteName, gamePanelName, whatsapp, telegram, email } = req.body;
  const settings = normalizeSettings(readDB('settings.json'));

  const titles = Array.isArray(linkTitle) ? linkTitle : [linkTitle];
  const urls = Array.isArray(linkUrl) ? linkUrl : [linkUrl];
  const ids = Array.isArray(linkId) ? linkId : [linkId];

  const telegramLinks = titles.map((title, idx) => ({
    id: parseInt(ids[idx], 10) || idx + 1,
    title: toCleanString(titles[idx] || '', ''),
    url: toCleanString(urls[idx] || '', '')
  })).filter(link => link.url);

  settings.telegramLinks = telegramLinks;
  settings.siteName = toCleanString(siteName, 'DMW STORE') || 'DMW STORE';
  settings.gamePanelName = toCleanString(gamePanelName, 'DMW STORE') || 'DMW STORE';
  settings.contact = {
    whatsapp: toCleanString(whatsapp, ''),
    telegram: toCleanString(telegram, ''),
    email: toCleanString(email, '')
  };

  writeDB('settings.json', settings);
  res.redirect('/admin');
});

app.post('/admin/whatsapp-links', requireAdmin, (req, res) => {
  const { linkId, linkTitle, linkUrl, siteName, gamePanelName, whatsapp, telegram, email } = req.body;
  const settings = normalizeSettings(readDB('settings.json'));

  const titles = Array.isArray(linkTitle) ? linkTitle : [linkTitle];
  const urls = Array.isArray(linkUrl) ? linkUrl : [linkUrl];
  const ids = Array.isArray(linkId) ? linkId : [linkId];

  const whatsappLinks = titles.map((title, idx) => ({
    id: parseInt(ids[idx], 10) || idx + 1,
    title: toCleanString(titles[idx] || '', ''),
    url: toCleanString(urls[idx] || '', '')
  })).filter(link => link.url);

  settings.whatsappLinks = whatsappLinks;
  settings.siteName = toCleanString(siteName, 'DMW STORE') || 'DMW STORE';
  settings.gamePanelName = toCleanString(gamePanelName, 'DMW STORE') || 'DMW STORE';
  settings.contact = {
    whatsapp: toCleanString(whatsapp, ''),
    telegram: toCleanString(telegram, ''),
    email: toCleanString(email, '')
  };

  writeDB('settings.json', settings);
  res.redirect('/admin');
});

app.post('/admin/footer-links', requireAdmin, (req, res) => {
  const { siteName, gamePanelName, whatsapp, telegram, email, footerSections, footerLinksData } = req.body;
  const settings = normalizeSettings(readDB('settings.json'));

  let footerLinks = [];
  if (footerLinksData) {
    try {
      footerLinks = JSON.parse(footerLinksData);
    } catch (e) {
      footerLinks = settings.footerLinks || [];
    }
  } else if (footerSections) {
    const sectionNames = Array.isArray(footerSections) ? footerSections : [footerSections];
    const linkTitles = Array.isArray(req.body.linkTitle) ? req.body.linkTitle : [req.body.linkTitle].filter(Boolean);
    const linkUrls = Array.isArray(req.body.linkUrl) ? req.body.linkUrl : [req.body.linkUrl].filter(Boolean);

    const sections = {};
    linkTitles.forEach((title, idx) => {
      const section = sectionNames[idx] || 'LAINNYA';
      if (!sections[section]) {
        sections[section] = [];
      }
      if (title && linkUrls[idx]) {
        sections[section].push({
          id: idx + 1,
          title: toCleanString(title, ''),
          url: toCleanString(linkUrls[idx], '')
        });
      }
    });

    footerLinks = Object.entries(sections).map(([section, links]) => ({
      section,
      links
    }));
  }

  settings.footerLinks = footerLinks;
  settings.siteName = toCleanString(siteName, 'DMW STORE') || 'DMW STORE';
  settings.gamePanelName = toCleanString(gamePanelName, 'DMW STORE') || 'DMW STORE';
  settings.contact = {
    whatsapp: toCleanString(whatsapp, ''),
    telegram: toCleanString(telegram, ''),
    email: toCleanString(email, '')
  };

  writeDB('settings.json', settings);
  res.redirect('/admin');
});

app.post('/admin/banners', requireAdmin, upload.single('bannerImage'), (req, res) => {
  const settings = normalizeSettings(readDB('settings.json'));
  const { bannerId, bannerTitle, bannerSubtitle, bannerImage: existingImage, bannerActive } = req.body;

  if (!settings.banners) settings.banners = [];

  const id = bannerId || uuidv4();
  const image = req.file ? `/uploads/products/${req.file.filename}` : existingImage;
  const active = bannerActive === 'true';

  const existingIndex = settings.banners.findIndex(b => b.id === id);

  const bannerData = {
    id,
    image,
    title: toCleanString(bannerTitle || '', ''),
    subtitle: toCleanString(bannerSubtitle || '', ''),
    active
  };

  if (existingIndex !== -1) {
    settings.banners[existingIndex] = bannerData;
  } else {
    settings.banners.push(bannerData);
  }

  writeDB('settings.json', settings);
  res.redirect('/admin');
});

app.post('/admin/banners/:id/delete', requireAdmin, (req, res) => {
  const settings = normalizeSettings(readDB('settings.json'));
  if (settings.banners) {
    const banner = settings.banners.find(b => b.id === req.params.id);
    if (banner && banner.image && !banner.image.startsWith('/images/')) {
      const imagePath = path.join(__dirname, 'public', banner.image);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }
    settings.banners = settings.banners.filter(b => b.id !== req.params.id);
  }
  writeDB('settings.json', settings);
  res.redirect('/admin');
});

app.get('/api/notifications', (req, res) => {
  const notifications = readDB('notifications.json');
  res.json(notifications.slice(0, 20));
});

app.get('/api/qr/:qrString', async (req, res) => {
  const qrString = req.params.qrString;
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  if (!qrString) {
    return res.status(400).json({ error: 'QR string required' });
  }
  if (!checkQrRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Too many requests. Please wait a moment.' });
  }
  try {
    const QRCode = require('qrcode');
    const qrDataUrl = await QRCode.toDataURL(qrString, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M'
    });
    res.json({ success: true, qrImage: qrDataUrl });
  } catch (err) {
    console.error('[QR] Generate error:', err.message);
    res.status(500).json({ error: 'Failed to generate QR' });
  }
});

app.get('/qr/:qrString', async (req, res) => {
  const qrString = req.params.qrString;
  const clientIp = req.ip || req.connection.remoteAddress || 'unknown';
  if (!qrString) {
    return res.status(400).send('QR string required');
  }
  if (!checkQrRateLimit(clientIp)) {
    return res.status(429).send('Too many requests. Please wait a moment.');
  }
  try {
    const QRCode = require('qrcode');
    res.type('image/png');
    await QRCode.toFileStream(res, qrString, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#ffffff' },
      errorCorrectionLevel: 'M'
    });
  } catch (err) {
    console.error('[QR] Generate error:', err.message);
    res.status(500).send('Failed to generate QR');
  }
});

app.get('/api/products', (req, res) => {
  const products = normalizeProducts(readDB('products.json'));
  res.json(products);
});

app.get('/api/transactions', (req, res) => {
  const transactions = readDB('transactions.json');
  res.json(transactions);
});

app.get('/api/vouchers/validate/:code', requireAuth, (req, res) => {
  const settings = normalizeSettings(readDB('settings.json'));
  const voucher = settings.vouchers?.find(v => v.code === req.params.code.toUpperCase() && v.active);

  if (voucher) {
    res.json({ valid: true, discountPercent: voucher.discountPercent, minPurchase: voucher.minPurchase });
  } else {
    res.json({ valid: false });
  }
});

const expressServer = app.listen(PORT, () => {
  console.log(`DMW STORE running on http://localhost:${PORT}`);
  console.log(`Admin login: admin / admin123`);
});
const { Server } = require('socket.io');
const io = new Server(expressServer);
io.on('connection', (socket) => {
  console.log('[SOCKET] User connected:', socket.id);
  socket.on('disconnect', () => {
    console.log('[SOCKET] User disconnected:', socket.id);
  });
});