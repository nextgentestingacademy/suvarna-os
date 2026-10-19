export interface DemoBranch {
  id: string;
  name: string;
  code: string;
  city: string;
  address: string;
  isMain: boolean;
}

export interface DemoProduct {
  id: string;
  sku: string;
  name: string;
  category: 'Necklaces' | 'Bangles' | 'Earrings' | 'Bridal' | 'Chains' | 'Pendants';
  metal: 'Gold' | 'Silver' | 'Platinum';
  purity: '24K' | '22K' | '18K' | '14K';
  grossWeight: number; // grams
  netWeight: number; // grams
  stoneWeight: number; // grams
  makingChargeType: 'Per Gram' | 'Percentage' | 'Fixed';
  makingCharge: number;
  price: number; // Indicative INR
  stock: number;
  huid?: string;
  status: 'In Stock' | 'Low Stock' | 'Out of Stock';
  branchId: string;
}

export interface DemoCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  segment: 'Gold SIP' | 'Bridal enquiry' | 'Repeat customer' | 'New enquiry';
  totalPurchases: string;
  lastInteraction: string;
  nextFollowUp: string;
  status: 'Active' | 'Follow-up' | 'New';
  notes: string;
  preferredContact: 'WhatsApp' | 'Phone call' | 'Showroom visit';
}

export interface DemoTransaction {
  id: string;
  invoiceNo: string;
  customerName: string;
  date: string;
  itemsCount: number;
  grossAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentStatus: 'Paid' | 'Partial' | 'Due';
  paymentMethod: 'UPI' | 'Card' | 'Cash' | 'Split';
  branchId: string;
}

export const DEMO_BRANCHES: DemoBranch[] = [
  {
    id: 'branch-fort',
    name: 'Fort Main Showroom',
    code: 'FORT',
    city: 'Mumbai',
    address: '124 Heritage Chambers, Fort, Mumbai 400001',
    isMain: true,
  },
  {
    id: 'branch-vashi',
    name: 'Navi Mumbai Studio',
    code: 'VASHI',
    city: 'Navi Mumbai',
    address: 'Sector 17, Vashi, Navi Mumbai 400703',
    isMain: false,
  },
];

export const DEMO_RATES = {
  gold24k: 13250,
  gold22k: 12150,
  gold18k: 9940,
  silver: 168,
  lastUpdated: 'Today, 11:30 AM IST (Indicative Market Feed)',
};

export const INITIAL_DEMO_PRODUCTS: DemoProduct[] = [
  {
    id: 'prod-1',
    sku: 'NK-22018',
    name: 'Temple Heritage Necklace',
    category: 'Necklaces',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 40.2,
    netWeight: 38.4,
    stoneWeight: 1.8,
    makingChargeType: 'Per Gram',
    makingCharge: 950,
    price: 467500,
    stock: 4,
    huid: 'HD92A1',
    status: 'Low Stock',
    branchId: 'branch-fort',
  },
  {
    id: 'prod-2',
    sku: 'BG-22027',
    name: 'Classic Calcutta Filigree Bangles',
    category: 'Bangles',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 24.8,
    netWeight: 24.8,
    stoneWeight: 0,
    makingChargeType: 'Per Gram',
    makingCharge: 750,
    price: 301320,
    stock: 8,
    huid: 'BF88C3',
    status: 'In Stock',
    branchId: 'branch-fort',
  },
  {
    id: 'prod-3',
    sku: 'ER-18014',
    name: 'Floral Solitaire Studs',
    category: 'Earrings',
    metal: 'Gold',
    purity: '18K',
    grossWeight: 5.6,
    netWeight: 5.2,
    stoneWeight: 0.4,
    makingChargeType: 'Fixed',
    makingCharge: 8500,
    price: 68500,
    stock: 12,
    huid: 'FL44X9',
    status: 'In Stock',
    branchId: 'branch-fort',
  },
  {
    id: 'prod-4',
    sku: 'BR-22003',
    name: 'Royal Rajputana Bridal Choker Set',
    category: 'Bridal',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 75.5,
    netWeight: 72.0,
    stoneWeight: 3.5,
    makingChargeType: 'Percentage',
    makingCharge: 18,
    price: 895000,
    stock: 2,
    huid: 'RR77Z2',
    status: 'Low Stock',
    branchId: 'branch-fort',
  },
  {
    id: 'prod-5',
    sku: 'CH-22039',
    name: 'Everyday Rope Gold Chain',
    category: 'Chains',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 12.6,
    netWeight: 12.6,
    stoneWeight: 0,
    makingChargeType: 'Per Gram',
    makingCharge: 550,
    price: 153090,
    stock: 14,
    huid: 'RC11M4',
    status: 'In Stock',
    branchId: 'branch-vashi',
  },
  {
    id: 'prod-6',
    sku: 'ER-18022',
    name: 'South Sea Pearl Drop Jhumkas',
    category: 'Earrings',
    metal: 'Gold',
    purity: '18K',
    grossWeight: 5.8,
    netWeight: 4.8,
    stoneWeight: 1.0,
    makingChargeType: 'Fixed',
    makingCharge: 6500,
    price: 42500,
    stock: 7,
    huid: 'PD33K8',
    status: 'In Stock',
    branchId: 'branch-vashi',
  },
  {
    id: 'prod-7',
    sku: 'PD-22012',
    name: 'Antique Lakshmi Coin Pendant',
    category: 'Pendants',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 8.4,
    netWeight: 8.4,
    stoneWeight: 0,
    makingChargeType: 'Per Gram',
    makingCharge: 680,
    price: 102060,
    stock: 3,
    huid: 'AL99P5',
    status: 'Low Stock',
    branchId: 'branch-fort',
  },
  {
    id: 'prod-8',
    sku: 'BG-22044',
    name: 'Kids Lightweight Kada Pair',
    category: 'Bangles',
    metal: 'Gold',
    purity: '22K',
    grossWeight: 9.2,
    netWeight: 9.2,
    stoneWeight: 0,
    makingChargeType: 'Per Gram',
    makingCharge: 700,
    price: 111780,
    stock: 9,
    huid: 'KK22W7',
    status: 'In Stock',
    branchId: 'branch-vashi',
  },
];

export const INITIAL_DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    id: 'cust-1',
    name: 'Ananya Mehta',
    phone: '+91 98201 99241',
    email: 'ananya.mehta@example.com',
    segment: 'Gold SIP',
    totalPurchases: '₹3,45,000',
    lastInteraction: 'Today · Showroom Visit',
    nextFollowUp: '05 Nov 2026',
    status: 'Active',
    notes: 'Enrolled in 10-month Gold SIP (₹5,000/mo). Looking for lightweight gold bangles on maturity.',
    preferredContact: 'WhatsApp',
  },
  {
    id: 'cust-2',
    name: 'Rohan Shah',
    phone: '+91 98190 44619',
    email: 'rohan.shah@example.com',
    segment: 'Bridal enquiry',
    totalPurchases: '₹8,95,000',
    lastInteraction: 'Yesterday · Bridal Consultation',
    nextFollowUp: 'Today · Quotation Review',
    status: 'Follow-up',
    notes: 'Wedding planned for December. Looking for bridal choker set and matching polki earrings.',
    preferredContact: 'Showroom visit',
  },
  {
    id: 'cust-3',
    name: 'Priya Desai',
    phone: '+91 99302 11803',
    email: 'priya.desai@example.com',
    segment: 'Repeat customer',
    totalPurchases: '₹1,98,400',
    lastInteraction: '08 Oct 2026 · Invoice INV-26091',
    nextFollowUp: 'Festive Season',
    status: 'Active',
    notes: 'Regular patron of diamond studs and antique gold pendants. Prefers festive catalogue previews.',
    preferredContact: 'WhatsApp',
  },
  {
    id: 'cust-4',
    name: 'Neel Kulkarni',
    phone: '+91 97693 55156',
    email: 'neel.k@example.com',
    segment: 'New enquiry',
    totalPurchases: '₹0 (New)',
    lastInteraction: '07 Oct 2026 · Web Storefront',
    nextFollowUp: 'Today · Chain availability',
    status: 'New',
    notes: 'Enquired about 22K men gold rope chains in 12–15g weight bracket.',
    preferredContact: 'Phone call',
  },
  {
    id: 'cust-5',
    name: 'Isha Patel',
    phone: '+91 98211 77421',
    email: 'isha.patel@example.com',
    segment: 'Gold SIP',
    totalPurchases: '₹75,000',
    lastInteraction: '06 Oct 2026 · Instalment Received',
    nextFollowUp: '10 Nov 2026',
    status: 'Active',
    notes: 'Consistent SIP investor. Enquired about Gold mortgage / loan referral options.',
    preferredContact: 'WhatsApp',
  },
];

export const INITIAL_DEMO_TRANSACTIONS: DemoTransaction[] = [
  {
    id: 'tx-1',
    invoiceNo: 'INV-26091',
    customerName: 'Priya Desai',
    date: '11 Oct 2026',
    itemsCount: 2,
    grossAmount: 66456.31,
    taxAmount: 1993.69,
    totalAmount: 68450,
    paymentStatus: 'Paid',
    paymentMethod: 'UPI',
    branchId: 'branch-fort',
  },
  {
    id: 'tx-2',
    invoiceNo: 'INV-26090',
    customerName: 'Ananya Mehta',
    date: '10 Oct 2026',
    itemsCount: 1,
    grossAmount: 121359.22,
    taxAmount: 3640.78,
    totalAmount: 125000,
    paymentStatus: 'Paid',
    paymentMethod: 'Card',
    branchId: 'branch-fort',
  },
  {
    id: 'tx-3',
    invoiceNo: 'INV-26089',
    customerName: 'Walk-in Customer (Mr. Joshi)',
    date: '10 Oct 2026',
    itemsCount: 1,
    grossAmount: 31796.12,
    taxAmount: 953.88,
    totalAmount: 32750,
    paymentStatus: 'Partial',
    paymentMethod: 'Split',
    branchId: 'branch-vashi',
  },
  {
    id: 'tx-4',
    invoiceNo: 'INV-26088',
    customerName: 'Rohan Shah',
    date: '09 Oct 2026',
    itemsCount: 2,
    grossAmount: 95631.07,
    taxAmount: 2868.93,
    totalAmount: 98500,
    paymentStatus: 'Due',
    paymentMethod: 'Card',
    branchId: 'branch-fort',
  },
];
