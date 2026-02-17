import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CheckCircle, Loader2, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";

export default function CustomerReorder() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');

  const [selectedOrder, setSelectedOrder] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [imageZoom, setImageZoom] = useState(100);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const { data: customer } = useQuery({
    queryKey: ['customer-by-token', token],
    queryFn: async () => {
      const customers = await base44.entities.Customer.filter({ unique_token: token });
      return customers[0];
    },
    enabled: !!token
  });

  const { data: orders = [], refetch } = useQuery({
    queryKey: ['customer-orders', customer?.id],
    queryFn: () => base44.entities.Order.filter({ 
      customer_id: customer.id,
      status: 'available',
      visible: true
    }),
    enabled: !!customer?.id
  });

  const handleReorder = (order) => {
    setSelectedOrder(order);
    setImageZoom(100);
    setPanX(0);
    setPanY(0);
  };

  const handleMouseDown = (e) => {
    if (imageZoom > 100) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && imageZoom > 100) {
      const newX = e.clientX - dragStart.x;
      const newY = e.clientY - dragStart.y;
      setPanX(newX);
      setPanY(newY);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleApprove = async () => {
    setProcessing(true);
    try {
      // Create QuickBooks invoice
      const { data: qbResponse } = await base44.functions.invoke('createQuickbooksInvoice', {
        order_id: selectedOrder.id,
        quickbooks_customer_id: selectedOrder.quickbooks_customer_id,
        product_type: selectedOrder.product_type,
        specifications: selectedOrder.specifications,
        pricing: selectedOrder.pricing
      });

      console.log("QB Response:", qbResponse);

      if (qbResponse.error) {
        throw new Error(qbResponse.error);
      }

      if (qbResponse.success && qbResponse.invoice_link) {
        // Create Monday.com item
        await base44.functions.invoke('createMondayItem', {
          order_id: selectedOrder.id,
          customer_name: customer.customer_name,
          company_name: customer.company_name,
          product_type: selectedOrder.product_type,
          specifications: selectedOrder.specifications,
          pricing: selectedOrder.pricing,
          mockup_url: selectedOrder.mockup_url
        });

        // Send email to internal team via backend
        const shippingInfo = selectedOrder.shipping_method === "office_pickup" 
          ? "Office Pickup" 
          : `Blind Ship${selectedOrder.ship_to_address ? ` - Ship to: ${selectedOrder.ship_to_address}` : ''}`;

        await base44.functions.invoke('sendOrderNotifications', {
          customer_name: customer.customer_name,
          company_name: customer.company_name,
          product_type: selectedOrder.product_type,
          pricing: selectedOrder.pricing,
          shipping_info: shippingInfo,
          invoice_number: qbResponse.invoice_number,
          mockup_url: selectedOrder.mockup_url
        });

        toast.success("Order approved! Redirecting to payment...");

        // Small delay to show the toast, then redirect
        setTimeout(() => {
          window.location.href = qbResponse.invoice_link;
        }, 1000);
      } else {
        throw new Error("Invoice link not available");
      }
    } catch (error) {
      console.error("Order processing error:", error);
      toast.error(error.message || "Failed to process order. Please try again.");
      setProcessing(false);
      setSelectedOrder(null);
    }
  };



  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Invalid access link</p>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <p className="text-slate-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="bg-white shadow border-b">
        <div className="max-w-6xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between mb-8">
            <img 
              src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69934b2bd076a1f3a472ce61/f4868db7a_Untitleddesign12.png" 
              alt="Orama Business Solutions"
              className="h-16 w-auto object-contain"
            />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-gray-900">Welcome back, {customer.customer_name}!</h1>
            {customer.company_name && (
              <p className="text-lg text-gray-600 mt-2">{customer.company_name}</p>
            )}
            <p className="text-gray-500 mt-3">Browse your previous orders and reorder in just a few clicks</p>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-8 py-16">
        <div>
          <div className="mb-12">
            <h2 className="text-2xl font-semibold text-gray-900 mb-2">Your Previous Orders</h2>
            <p className="text-gray-600">Select any item to place a new order</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.map((order) => (
              <Card key={order.id} onClick={() => handleReorder(order)} className="hover:shadow-2xl transition-all duration-300 cursor-pointer group bg-white border-0 overflow-hidden">
                <div className="relative bg-gray-100 h-64 overflow-hidden flex items-center justify-center">
                   {order.mockup_url && (
                     <img
                       src={order.mockup_url}
                       alt={order.product_type}
                       className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform duration-500"
                     />
                   )}
                   <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                 </div>
                <CardHeader className="pb-3">
                  <CardTitle className="text-xl group-hover:text-[#EF4444] transition-colors duration-300">
                    {order.product_type}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                    <p className="text-sm text-gray-700 whitespace-pre-line line-clamp-3 leading-relaxed">
                      {order.specifications}
                    </p>
                  </div>
                  <div className="flex items-center justify-between pt-3 border-t border-slate-200">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">{order.quantity ? `Price for ${order.quantity}` : 'Price'}</p>
                      <span className="text-2xl font-bold text-[#EF4444]">
                        ${order.pricing.toFixed(2)}
                      </span>
                    </div>
                    <Button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleReorder(order);
                      }}
                      className="bg-[#EF4444] hover:bg-[#DC2626] text-white transition-all duration-300 shadow-md hover:shadow-lg"
                    >
                      Reorder
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {orders.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No items available for reorder at this time.</p>
          </div>
        )}
      </div>

      <Dialog open={!!selectedOrder} onOpenChange={() => !processing && setSelectedOrder(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl">Review Your Order</DialogTitle>
          </DialogHeader>
          {selectedOrder && (
            <>
              <div className="space-y-6 overflow-y-auto flex-1">
                <div>
                   <div className="flex items-center justify-between mb-3">
                     <h3 className="font-semibold text-lg">{selectedOrder.product_type}</h3>
                     {selectedOrder.mockup_url && (
                       <div className="flex items-center gap-2 bg-gray-100 px-3 py-2 rounded-lg">
                         <Button
                           size="sm"
                           variant="ghost"
                           onClick={() => setImageZoom(Math.max(100, imageZoom - 25))}
                           disabled={imageZoom === 100}
                         >
                           <ZoomOut className="w-4 h-4" />
                         </Button>
                         <span className="text-sm font-medium w-12 text-center">{imageZoom}%</span>
                         <Button
                           size="sm"
                           variant="ghost"
                           onClick={() => setImageZoom(Math.min(300, imageZoom + 25))}
                           disabled={imageZoom === 300}
                         >
                           <ZoomIn className="w-4 h-4" />
                         </Button>
                       </div>
                     )}
                   </div>
                   {selectedOrder.mockup_url && (
                     <div 
                       className="flex items-center justify-center bg-gray-50 rounded-lg p-4 overflow-hidden max-h-96 cursor-grab active:cursor-grabbing"
                       onMouseDown={handleMouseDown}
                       onMouseMove={handleMouseMove}
                       onMouseUp={handleMouseUp}
                       onMouseLeave={handleMouseUp}
                       style={{ userSelect: 'none' }}
                     >
                       <img
                         src={selectedOrder.mockup_url}
                         alt={selectedOrder.product_type}
                         className="rounded-lg shadow-lg transition-transform"
                         style={{ 
                           transform: `scale(${imageZoom / 100}) translate(${panX}px, ${panY}px)`,
                           transformOrigin: 'center'
                         }}
                         draggable={false}
                       />
                     </div>
                   )}
                 </div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <h4 className="font-semibold mb-2">Specifications:</h4>
                  <p className="text-sm text-slate-700 whitespace-pre-line">
                    {selectedOrder.specifications}
                  </p>
                </div>
                {selectedOrder.shipping_method && (
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    {selectedOrder.shipping_method === "office_pickup" ? (
                      <p className="text-blue-800 font-medium">📍 Office Pickup</p>
                    ) : (
                     <>
                       <p className="text-blue-800 font-medium mb-2">📦 Ship To</p>
                       {selectedOrder.ship_to_address && (
                         <p className="text-blue-700 text-sm">Address: {selectedOrder.ship_to_address}</p>
                       )}
                     </>
                    )}
                  </div>
                )}
                <div className="flex justify-between items-center py-4 border-t">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">{selectedOrder.quantity ? `Total for ${selectedOrder.quantity}` : 'Total'}</p>
                    <span className="text-2xl font-bold">Total: ${selectedOrder.pricing.toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="flex justify-center pt-4 border-t">
                <Button
                  onClick={handleApprove}
                  className="w-full max-w-xs bg-black hover:bg-gray-800 text-white"
                  disabled={processing}
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Approve & Pay
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}