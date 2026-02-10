
import React, { useState, useEffect } from 'react';
import { ViewMode, Product, CartItem, Order, CustomerDetails, OrderStatus, Review, Message } from './types';
import Sidebar from './components/Sidebar';
import HomeView from './components/HomeView';
import MarketplaceView, { PRODUCTS as INITIAL_PRODUCTS } from './components/MarketplaceView';
import SupportChatView from './components/SupportChatView';
import ProductDetailView from './components/ProductDetailView';
import CartView from './components/CartView';
import AdminView from './components/AdminView';
import CheckoutFormView from './components/CheckoutFormView';
import OrderTrackingView from './components/OrderTrackingView';
import { processMarketplaceQuery } from './services/geminiService';

// Helper for secure ID generation
const generateTrackingId = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude ambiguous chars (I, 1, O, 0)
  let result = 'TRK-';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

// Initial dummy orders for demonstration
const INITIAL_ORDERS: Order[] = [
  {
    id: 'TRK-9J2M4',
    customer: {
        name: 'Guest User',
        email: 'guest@example.com',
        phone: '08012345678',
        address: '123 Lagos Way, Ikeja'
    },
    items: [
      { id: 'p1', name: 'iPhone 15 Pro Max', price: 2250000, category: 'Phones', image: 'https://images.unsplash.com/photo-1696446701796-da61225697cc?auto=format&fit=crop&q=80&w=800', description: '', quantity: 1, selectedColor: 'Natural Titanium' }
    ],
    totalAmount: 2475000, // +10% tax
    status: 'PENDING',
    timestamp: Date.now() - 3600000, // 1 hour ago
    paymentMethod: 'Transfer'
  }
];

const INITIAL_CATEGORIES = [
  { id: 'All', label: 'All Products' },
  { id: 'Phones', label: 'Smartphones' },
  { id: 'Perfume', label: 'Fragrances' },
  { id: 'Jerseys', label: 'Soccer Jerseys' },
  { id: 'Soccer Boots', label: 'Soccer Boots' },
  { id: 'Socks', label: 'Performance Socks' },
  { id: 'Phone Pouches', label: 'Phone Pouches' },
];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<ViewMode>(ViewMode.HOME);
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedProductColor, setSelectedProductColor] = useState<string | undefined>(undefined);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showToast, setShowToast] = useState(false);
  
  // Tracking State
  const [searchedOrder, setSearchedOrder] = useState<Order | null>(null);
  
  // Support Chat State (Lifted)
  const [supportMessages, setSupportMessages] = useState<Message[]>([{
    id: '1',
    role: 'assistant',
    content: `Welcome to H8 MARKETPLACE Support. How can I assist you with your purchase today?`,
    timestamp: Date.now()
  }]);
  const [archivedSessions, setArchivedSessions] = useState<Message[][]>([]);
  const [isLiveSupportActive, setIsLiveSupportActive] = useState(false);
  const [isSupportTyping, setIsSupportTyping] = useState(false);
  const [hasUnreadSupportMessage, setHasUnreadSupportMessage] = useState(false);

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('h8_dark_mode');
      if (saved !== null) {
        return JSON.parse(saved);
      }
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return false;
  });

  useEffect(() => {
    localStorage.setItem('h8_dark_mode', JSON.stringify(isDarkMode));
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);
  
  // Checkout State
  const [pendingCheckoutItems, setPendingCheckoutItems] = useState<CartItem[]>([]);
  const [currentCustomer, setCurrentCustomer] = useState<CustomerDetails | null>(null);

  const [orders, setOrders] = useState<Order[]>(INITIAL_ORDERS);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [categories, setCategories] = useState(INITIAL_CATEGORIES);
  
  // Admin Auth State
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setSidebarOpen(false);
      else setSidebarOpen(true);
    };
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleProductSelect = (product: Product) => {
    setSelectedProduct(product);
    setCurrentView(ViewMode.PRODUCT_DETAIL);
  };

  const handleAddToCart = (product: Product, color?: string) => {
    if (product.isOutOfStock) return;

    setCart(prev => {
      const existing = prev.find(item => item.id === product.id && item.selectedColor === color);
      if (existing) {
        return prev.map(item => item.id === product.id && item.selectedColor === color ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, selectedColor: color, quantity: 1 }];
    });
    
    // Show toast
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2000);
  };

  const handleRemoveFromCart = (productId: string, color?: string) => {
    setCart(prev => prev.filter(item => !(item.id === productId && item.selectedColor === color)));
  };

  const handleUpdateCartQuantity = (productId: string, color: string | undefined, delta: number) => {
    setCart(prev => prev.map(item => {
        if (item.id === productId && item.selectedColor === color) {
            const newQty = item.quantity + delta;
            return newQty > 0 ? { ...item, quantity: newQty } : item;
        }
        return item;
    }));
  };

  // 1. Triggered by "Buy Now" on Product Detail
  const handleBuyNowFromDetail = (product: Product, color?: string) => {
    if (product.isOutOfStock) return;
    setPendingCheckoutItems([{ ...product, quantity: 1, selectedColor: color }]);
    setSelectedProduct(product);
    setSelectedProductColor(color);
    setCurrentView(ViewMode.CHECKOUT_FORM);
  };

  // 2. Triggered by "Checkout" in Cart
  const handleCheckoutCart = () => {
    if (cart.length === 0) return;
    setPendingCheckoutItems(cart);
    setSelectedProduct(null); // Clear specific selection as it's a bulk order
    setSelectedProductColor(undefined);
    setCurrentView(ViewMode.CHECKOUT_FORM);
  };

  // Helper to calculate price with discount
  const getEffectivePrice = (item: CartItem | Product) => {
    if (item.discount && item.discount > 0) {
      return item.price * (1 - item.discount / 100);
    }
    return item.price;
  };

  // 3. Triggered by Submitting the Checkout Form
  const handleFinalizeOrder = (details: CustomerDetails) => {
    setCurrentCustomer(details);
    const trackingId = generateTrackingId();
    
    const totalBase = pendingCheckoutItems.reduce((acc, item) => acc + (getEffectivePrice(item) * item.quantity), 0);
    const newOrder: Order = {
      id: trackingId,
      customer: details,
      items: [...pendingCheckoutItems],
      totalAmount: totalBase * 1.1, // 10% tax
      status: 'PENDING',
      timestamp: Date.now(),
      paymentMethod: 'Transfer'
    };
    
    setOrders(prev => [newOrder, ...prev]);
    // Set this as the searched order so they see it immediately if they go to tracking
    setSearchedOrder(newOrder);
    
    // Clear cart if this was a cart checkout (simplistic check)
    if (cart.length > 0 && pendingCheckoutItems.length === cart.length && pendingCheckoutItems[0].id === cart[0].id) {
        setCart([]);
    }

    // Go to support chat first for payment instructions
    setCurrentView(ViewMode.SUPPORT_DM);
  };

  // --- SUPPORT CHAT LOGIC (AI + Human Handover) ---
  const handleCustomerMessage = async (text: string) => {
    // 1. Add User Message
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setSupportMessages(prev => [...prev, userMsg]);

    // 2. Check for escalation keywords
    const lowerText = text.toLowerCase();
    const escalationKeywords = ['human', 'agent', 'support person', 'real person', 'staff', 'representative', 'customer service'];
    const needsEscalation = escalationKeywords.some(kw => lowerText.includes(kw));

    // 3. If Live Support is ALREADY active, do nothing (wait for Admin to reply)
    if (isLiveSupportActive) {
      setHasUnreadSupportMessage(true);
      return; 
    }

    // 4. If escalation triggered, switch mode
    if (needsEscalation) {
       setIsLiveSupportActive(true);
       setHasUnreadSupportMessage(true);
       setIsSupportTyping(true);
       
       setTimeout(() => {
         setSupportMessages(prev => [...prev, {
            id: 'sys-' + Date.now(),
            role: 'system', // Special styling for system
            content: "Request received. Connecting you to a human agent... Please wait.",
            timestamp: Date.now()
         }]);
         setIsSupportTyping(false);
       }, 1000);
       return;
    }

    // 5. Normal AI Processing
    setIsSupportTyping(true);
    try {
      // Don't include system prompts in history for the AI context to keep it clean
      const history = supportMessages
        .filter(m => m.role !== 'system')
        .map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));
      
      // Pass product context
      const botResponse = await processMarketplaceQuery(text, history, products);
      
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: botResponse,
        timestamp: Date.now(),
        isInvoice: botResponse.includes('Total') || botResponse.includes('Account') || botResponse.includes('TRACKING ID')
      };
      setSupportMessages(prev => [...prev, botMsg]);
    } catch (error) {
      setSupportMessages(prev => [...prev, { id: 'err', role: 'assistant', content: "I'm having trouble connecting. Please try again or ask for a human agent.", timestamp: Date.now() }]);
    } finally {
      setIsSupportTyping(false);
    }
  };

  const handleAdminSupportReply = (text: string) => {
    const adminMsg: Message = {
      id: 'adm-' + Date.now(),
      role: 'assistant',
      content: text,
      timestamp: Date.now()
    };
    setSupportMessages(prev => [...prev, adminMsg]);
    setHasUnreadSupportMessage(false);
  };

  // Archive & Reset Session
  const handleResolveSupport = () => {
    if (supportMessages.length <= 1) return; // Don't archive empty or just welcome msg
    
    setArchivedSessions(prev => [supportMessages, ...prev]);
    
    // Reset active chat
    setSupportMessages([{
      id: Date.now().toString(),
      role: 'assistant',
      content: `Welcome to H8 MARKETPLACE Support. How can I assist you with your purchase today?`,
      timestamp: Date.now()
    }]);
    setIsLiveSupportActive(false);
    setHasUnreadSupportMessage(false);
  };

  const navigateToMarketplace = (category: string = 'All') => {
    setSelectedCategory(category);
    setCurrentView(ViewMode.MARKETPLACE);
  };

  const handleSidebarNavigation = (view: ViewMode) => {
    if (view === ViewMode.SUPPORT_DM) {
      // Reset checkout context if manually navigating to support
      setPendingCheckoutItems([]);
      // Keep customer context if they have already ordered
    }
    // Clear searched order when leaving tracking to clean up state
    if (currentView === ViewMode.ORDER_TRACKING && view !== ViewMode.ORDER_TRACKING) {
       setSearchedOrder(null);
    }
    setCurrentView(view);
  };

  const handleToggleOrderStatus = (orderId: string, status: OrderStatus) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o));
  };

  const handleBulkOrderStatusUpdate = (orderIds: string[], status: OrderStatus) => {
    setOrders(prev => prev.map(o => orderIds.includes(o.id) ? { ...o, status } : o));
  };

  const handleAdminLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const password = formData.get('password') as string;
    if (password === 'admin') {
      setIsAdmin(true);
    } else {
      alert('Invalid credentials');
    }
  };

  // Secure Tracking Handler
  const handleTrackById = (trackingId: string) => {
    const id = trackingId.trim().toUpperCase();
    const foundOrder = orders.find(o => o.id === id);
    
    if (foundOrder) {
      setSearchedOrder(foundOrder);
    } else {
      setSearchedOrder(null);
      // We don't want to expose if ID exists or not aggressively, but in UI we need feedback
      alert('Order not found. Please verify your Tracking ID.');
    }
  };

  // Logic to determine which orders to show in Tracking View
  const getVisibleOrders = () => {
    // 1. Orders belonging to current session user
    const sessionOrders = currentCustomer 
      ? orders.filter(o => o.customer.email === currentCustomer.email) 
      : [];
    
    // 2. Explicitly searched order (guest tracking)
    // Avoid duplicates if searched order is already in session orders
    if (searchedOrder && !sessionOrders.find(o => o.id === searchedOrder.id)) {
      return [searchedOrder, ...sessionOrders];
    }
    
    return sessionOrders.length > 0 ? sessionOrders : (searchedOrder ? [searchedOrder] : []);
  };

  // --- Admin Inventory Handlers ---

  const handleUpdateProductImage = (productId: string, imageUrl: string) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, image: imageUrl } : p));
  };

  const handleAddProduct = (productData: Omit<Product, 'id'>) => {
    const newProduct: Product = {
      ...productData,
      id: `p-${Date.now()}`,
      isOutOfStock: false,
      discount: 0,
      reviews: []
    };
    setProducts(prev => [newProduct, ...prev]);
  };

  const handleDeleteProduct = (productId: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      setProducts(prev => prev.filter(p => p.id !== productId));
    }
  };

  const handleToggleStock = (productId: string) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, isOutOfStock: !p.isOutOfStock } : p));
  };

  const handleUpdateDiscount = (productId: string, discount: number) => {
    setProducts(prev => prev.map(p => p.id === productId ? { ...p, discount: Math.max(0, Math.min(100, discount)) } : p));
  };

  const handleAddCategory = (categoryName: string) => {
    if (!categories.find(c => c.id === categoryName)) {
      setCategories(prev => [...prev, { id: categoryName, label: categoryName }]);
    }
  };

  const handleAddReview = (productId: string, review: Omit<Review, 'id' | 'timestamp'>) => {
    const newReview: Review = {
      ...review,
      id: `rev-${Date.now()}`,
      timestamp: Date.now()
    };
    
    setProducts(prev => prev.map(p => {
      if (p.id === productId) {
        return {
          ...p,
          reviews: [newReview, ...(p.reviews || [])]
        };
      }
      return p;
    }));
    
    // Update selected product view as well
    if (selectedProduct && selectedProduct.id === productId) {
      setSelectedProduct(prev => {
        if (!prev) return null;
        return {
           ...prev,
           reviews: [newReview, ...(prev.reviews || [])]
        };
      });
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden relative transition-colors duration-300">
      {/* Toast Notification */}
      {showToast && (
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-top-2">
          <div className="bg-slate-900 dark:bg-slate-800 text-white px-6 py-3 rounded-xl shadow-2xl flex items-center gap-3">
            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium text-sm">Added to cart successfully</span>
          </div>
        </div>
      )}

      {/* Ambient Background for Light/Dark Mode */}
      <div className="fixed top-0 left-0 w-full h-full pointer-events-none opacity-50 z-0">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-100/50 dark:bg-blue-900/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] bg-cyan-100/50 dark:bg-cyan-900/20 rounded-full blur-[120px]" />
      </div>

      <Sidebar 
        currentView={currentView} 
        setView={handleSidebarNavigation} 
        isOpen={isSidebarOpen}
        toggle={() => setSidebarOpen(!isSidebarOpen)}
        selectedCategory={selectedCategory}
        onSelectCategory={navigateToMarketplace}
        isAdmin={isAdmin}
        categories={categories}
        isDarkMode={isDarkMode}
        toggleDarkMode={toggleDarkMode}
      />

      <main className="flex-1 relative flex flex-col min-w-0 z-10">
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between px-6 glass bg-white/60 dark:bg-slate-900/60 transition-colors duration-300">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-outfit font-bold tracking-tight text-slate-800 dark:text-slate-100">
              {currentView === ViewMode.HOME && "H8 Marketplace Enterprise"}
              {currentView === ViewMode.MARKETPLACE && `Marketplace: ${selectedCategory}`}
              {currentView === ViewMode.PRODUCT_DETAIL && "Product Details"}
              {currentView === ViewMode.SUPPORT_DM && (isLiveSupportActive ? "Live Support" : "Secure Payment & Support")}
              {currentView === ViewMode.CART && "Shopping Cart"}
              {currentView === ViewMode.CHECKOUT_FORM && "Buyer Details"}
              {currentView === ViewMode.ORDER_TRACKING && "Track Orders"}
              {currentView === ViewMode.ADMIN && (isAdmin ? "Admin Dashboard" : "Staff Access")}
            </h1>
          </div>
          <div className="flex items-center gap-4">
             <button 
               onClick={() => setCurrentView(ViewMode.CART)}
               className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold border transition-all active:scale-95 ${
                 cart.length > 0 
                   ? 'bg-blue-600 text-white border-blue-600 shadow-lg shadow-blue-500/20' 
                   : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:text-slate-800 dark:hover:text-slate-200'
               }`}
             >
               <div className="relative">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                 </svg>
                 {cart.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white md:hidden"></span>
                 )}
               </div>
               <span className="hidden md:inline">{cart.reduce((acc, item) => acc + item.quantity, 0)} Items</span>
               <span className="md:hidden">Cart</span>
             </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          {currentView === ViewMode.HOME && <HomeView onShopNow={() => navigateToMarketplace('All')} />}
          
          {currentView === ViewMode.MARKETPLACE && (
            <MarketplaceView 
              products={products}
              onBuy={handleProductSelect} 
              activeCategory={selectedCategory} 
              onCategoryChange={setSelectedCategory}
              categories={categories}
            />
          )}

          {currentView === ViewMode.PRODUCT_DETAIL && selectedProduct && (
            <ProductDetailView 
              product={selectedProduct}
              onBack={() => setCurrentView(ViewMode.MARKETPLACE)}
              onAddToCart={handleAddToCart}
              onBuyNow={handleBuyNowFromDetail}
              onAddReview={handleAddReview}
            />
          )}

          {currentView === ViewMode.CART && (
            <CartView 
              cart={cart}
              onRemove={handleRemoveFromCart}
              onUpdateQuantity={handleUpdateCartQuantity}
              onCheckout={handleCheckoutCart}
              onContinueShopping={() => navigateToMarketplace('All')}
              onProductClick={handleProductSelect}
            />
          )}

          {currentView === ViewMode.CHECKOUT_FORM && (
            <CheckoutFormView 
              items={pendingCheckoutItems}
              onSubmit={handleFinalizeOrder}
              onCancel={() => {
                if(cart.length > 0) setCurrentView(ViewMode.CART);
                else if(selectedProduct) setCurrentView(ViewMode.PRODUCT_DETAIL);
                else navigateToMarketplace();
              }}
            />
          )}

          {currentView === ViewMode.SUPPORT_DM && (
            <SupportChatView 
              messages={supportMessages}
              onSendMessage={handleCustomerMessage}
              isLoading={isSupportTyping}
              isLiveSupport={isLiveSupportActive}
              preselectedProduct={null}
              preselectedColor={undefined}
              cartItems={pendingCheckoutItems} 
              isCartCheckout={pendingCheckoutItems.length > 0}
              customerDetails={currentCustomer}
              lastOrder={orders.length > 0 ? orders[0] : undefined}
            />
          )}

          {currentView === ViewMode.ORDER_TRACKING && (
            <OrderTrackingView 
              orders={getVisibleOrders()}
              onTrackOrder={handleTrackById}
            />
          )}

          {currentView === ViewMode.ADMIN && (
            isAdmin ? (
              <AdminView 
                orders={orders}
                products={products}
                onToggleStatus={handleToggleOrderStatus}
                onBulkUpdateStatus={handleBulkOrderStatusUpdate}
                onUpdateProductImage={handleUpdateProductImage}
                onAddProduct={handleAddProduct}
                onDeleteProduct={handleDeleteProduct}
                onToggleStock={handleToggleStock}
                onUpdateDiscount={handleUpdateDiscount}
                onLogout={() => {
                  setIsAdmin(false);
                  setCurrentView(ViewMode.HOME);
                }}
                categories={categories}
                onAddCategory={handleAddCategory}
                supportMessages={supportMessages}
                onSendSupportReply={handleAdminSupportReply}
                hasUnreadSupport={hasUnreadSupportMessage}
                onResolveSupport={handleResolveSupport}
                archivedSessions={archivedSessions}
              />
            ) : (
              <div className="h-full flex items-center justify-center p-6">
                <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-800 max-w-sm w-full animate-in fade-in zoom-in duration-300">
                  <div className="text-center mb-8">
                    <div className="w-16 h-16 bg-slate-900 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-slate-900/20">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-outfit font-bold text-slate-900 dark:text-white">Restricted Access</h2>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">Enter credentials to access the admin panel.</p>
                  </div>
                  
                  <form onSubmit={handleAdminLogin} className="space-y-4">
                    <div>
                      <input 
                        type="password" 
                        name="password"
                        placeholder="Admin Password"
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900/10 dark:focus:ring-white/10 focus:border-slate-400 dark:focus:border-slate-500 transition-all text-center tracking-widest text-slate-900 dark:text-white"
                        autoFocus
                      />
                    </div>
                    <button 
                      type="submit"
                      className="w-full py-3 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 text-white font-bold rounded-xl transition-all active:scale-95 shadow-lg shadow-slate-900/20"
                    >
                      Verify Identity
                    </button>
                  </form>
                  <p className="text-center mt-6 text-[10px] text-slate-400 font-mono">
                    H8 ENTERPRISE SYSTEM • SECURE AREA<br/>
                    (Hint: password is 'admin')
                  </p>
                </div>
              </div>
            )
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
