import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Plus, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { toast } from "sonner";

export default function CustomerDetail() {
  const urlParams = new URLSearchParams(window.location.search);
  const customerId = urlParams.get('id');

  const [open, setOpen] = useState(false);
  const [productType, setProductType] = useState("");
  const [specifications, setSpecifications] = useState("");
  const [pricing, setPricing] = useState("");
  const [mockupFile, setMockupFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const { data: customer } = useQuery({
    queryKey: ['customer', customerId],
    queryFn: async () => {
      const customers = await base44.entities.Customer.filter({ id: customerId });
      return customers[0];
    },
    enabled: !!customerId
  });

  const { data: orders = [], refetch } = useQuery({
    queryKey: ['orders', customerId],
    queryFn: () => base44.entities.Order.filter({ customer_id: customerId }, '-created_date'),
    enabled: !!customerId
  });

  const handleAddOrder = async (e) => {
    e.preventDefault();
    setUploading(true);

    try {
      let mockupUrl = "";
      if (mockupFile) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: mockupFile });
        mockupUrl = file_url;
      }

      await base44.entities.Order.create({
        customer_id: customerId,
        product_type: productType,
        specifications: specifications,
        pricing: parseFloat(pricing),
        mockup_url: mockupUrl,
        status: "available"
      });

      toast.success("Order added successfully!");
      setOpen(false);
      setProductType("");
      setSpecifications("");
      setPricing("");
      setMockupFile(null);
      refetch();
    } catch (error) {
      toast.error("Failed to add order");
    } finally {
      setUploading(false);
    }
  };

  if (!customer) return <div className="p-8">Loading...</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <Link to={createPageUrl('AdminDashboard')}>
          <Button variant="ghost" className="mb-6">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </Link>

        <div className="flex justify-between items-start mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">{customer.customer_name}</h1>
            {customer.company_name && (
              <p className="text-xl text-slate-600 mt-2">{customer.company_name}</p>
            )}
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                Add Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Previous Order</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddOrder} className="space-y-4">
                <div>
                  <Label htmlFor="productType">Product Type *</Label>
                  <Input
                    id="productType"
                    value={productType}
                    onChange={(e) => setProductType(e.target.value)}
                    required
                    placeholder="Business Cards, Brochures, Menus, etc."
                  />
                </div>
                <div>
                  <Label htmlFor="specifications">Specifications *</Label>
                  <Textarea
                    id="specifications"
                    value={specifications}
                    onChange={(e) => setSpecifications(e.target.value)}
                    required
                    rows={6}
                    placeholder="Size: 3.5x2&#10;Material: 16pt Cardstock&#10;Finish: Matte&#10;Quantity: 500&#10;Colors: Full Color Front, Black & White Back"
                  />
                </div>
                <div>
                  <Label htmlFor="pricing">Price (USD) *</Label>
                  <Input
                    id="pricing"
                    type="number"
                    step="0.01"
                    value={pricing}
                    onChange={(e) => setPricing(e.target.value)}
                    required
                    placeholder="99.99"
                  />
                </div>
                <div>
                  <Label htmlFor="mockup">Design Mockup</Label>
                  <Input
                    id="mockup"
                    type="file"
                    accept="image/*"
                    onChange={(e) => setMockupFile(e.target.files[0])}
                  />
                  <p className="text-xs text-slate-500 mt-1">Upload a preview image of the design</p>
                </div>
                <Button type="submit" className="w-full" disabled={uploading}>
                  {uploading ? "Uploading..." : "Add Order"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {orders.map((order) => (
            <Card key={order.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-lg">{order.product_type}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.mockup_url && (
                  <img
                    src={order.mockup_url}
                    alt={order.product_type}
                    className="w-full h-48 object-cover rounded-lg"
                  />
                )}
                <div className="bg-slate-50 p-3 rounded-lg">
                  <p className="text-sm text-slate-700 whitespace-pre-line">{order.specifications}</p>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold text-blue-600">${order.pricing.toFixed(2)}</span>
                  <span className="text-sm text-slate-500 capitalize">{order.status.replace('_', ' ')}</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {orders.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No orders yet. Add previous orders for this customer.</p>
          </div>
        )}
      </div>
    </div>
  );
}