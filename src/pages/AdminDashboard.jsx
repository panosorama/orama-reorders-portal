import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, ExternalLink, Copy } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";
import { toast } from "sonner";

export default function AdminDashboard() {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [email, setEmail] = useState("");

  const { data: customers = [], refetch } = useQuery({
    queryKey: ['customers'],
    queryFn: () => base44.entities.Customer.list('-created_date')
  });

  const generateToken = () => {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  };

  const handleCreateCustomer = async (e) => {
    e.preventDefault();
    
    const uniqueToken = generateToken();
    
    await base44.entities.Customer.create({
      customer_name: customerName,
      company_name: companyName,
      email: email,
      unique_token: uniqueToken
    });

    toast.success("Customer created successfully!");
    setOpen(false);
    setCustomerName("");
    setCompanyName("");
    setEmail("");
    refetch();
  };

  const copyLink = (token) => {
    const url = `${window.location.origin}${createPageUrl(`CustomerReorder?token=${token}`)}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-slate-900">Orama Solutions</h1>
            <p className="text-slate-600 mt-2">Customer Reorder Portal</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-4 h-4 mr-2" />
                New Customer
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Customer</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateCustomer} className="space-y-4">
                <div>
                  <Label htmlFor="customerName">Customer Name *</Label>
                  <Input
                    id="customerName"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                    placeholder="John Doe"
                  />
                </div>
                <div>
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    placeholder="ABC Corporation"
                  />
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="customer@example.com"
                  />
                </div>
                <Button type="submit" className="w-full">Create Customer</Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {customers.map((customer) => (
            <Card key={customer.id} className="hover:shadow-lg transition-shadow">
              <CardHeader>
                <CardTitle className="text-xl">{customer.customer_name}</CardTitle>
                {customer.company_name && (
                  <p className="text-sm text-slate-600">{customer.company_name}</p>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {customer.email && (
                  <p className="text-sm text-slate-600">{customer.email}</p>
                )}
                <div className="flex gap-2">
                  <Link to={createPageUrl(`CustomerDetail?id=${customer.id}`)} className="flex-1">
                    <Button variant="outline" className="w-full">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Manage Orders
                    </Button>
                  </Link>
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => copyLink(customer.unique_token)}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Customer Link
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        {customers.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500 text-lg">No customers yet. Create your first customer to get started!</p>
          </div>
        )}
      </div>
    </div>
  );
}