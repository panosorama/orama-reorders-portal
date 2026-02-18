import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Settings, Loader2, CheckCircle2, AlertCircle, Eye, EyeOff, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function QuickbooksSettingsDialog({ open, onOpenChange }) {
  const [credentials, setCredentials] = useState({
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    realmId: ""
  });
  const [showSecrets, setShowSecrets] = useState({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const toggleShow = (field) => setShowSecrets(prev => ({ ...prev, [field]: !prev[field] }));

  const handleTest = async () => {
    const missing = Object.entries(credentials).filter(([, v]) => !v.trim()).map(([k]) => k);
    if (missing.length > 0) {
      toast.error("Please fill in all fields before testing");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const { data } = await base44.functions.invoke('updateQuickbooksCredentials', credentials);
      if (data.error) {
        setTestResult({ success: false, message: data.error });
      } else {
        setTestResult({ success: true, message: data.message, newRefreshToken: data.new_refresh_token });
      }
    } catch (err) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  const fields = [
    { key: "clientId", label: "Client ID", placeholder: "AB..." },
    { key: "clientSecret", label: "Client Secret", placeholder: "Your QB Client Secret", secret: true },
    { key: "refreshToken", label: "Refresh Token", placeholder: "QB OAuth Refresh Token", secret: true },
    { key: "realmId", label: "Realm ID (Company ID)", placeholder: "1234567890" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            QuickBooks Credentials
          </DialogTitle>
          <DialogDescription>
            Enter your new QuickBooks credentials to verify them. After verification, update each value in{" "}
            <a href="https://base44.com/dashboard" target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">
              Dashboard → Settings → Environment Variables <ExternalLink className="w-3 h-3" />
            </a>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {fields.map(({ key, label, placeholder, secret }) => (
            <div key={key}>
              <Label htmlFor={key}>{label}</Label>
              <div className="relative mt-1">
                <Input
                  id={key}
                  type={secret && !showSecrets[key] ? "password" : "text"}
                  value={credentials[key]}
                  onChange={(e) => setCredentials(prev => ({ ...prev, [key]: e.target.value }))}
                  placeholder={placeholder}
                  className="pr-10"
                />
                {secret && (
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    onClick={() => toggleShow(key)}
                  >
                    {showSecrets[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
            </div>
          ))}

          <Button onClick={handleTest} disabled={testing} className="w-full bg-[#2CA01C] hover:bg-[#228B16]">
            {testing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Testing...</> : "Test Credentials"}
          </Button>

          {testResult && (
            <div className={`rounded-lg p-4 flex gap-3 text-sm ${testResult.success ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              {testResult.success
                ? <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                : <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
              <div>
                <p className={testResult.success ? "text-green-800" : "text-red-800"}>{testResult.message}</p>
                {testResult.success && testResult.newRefreshToken && (
                  <div className="mt-2">
                    <p className="text-green-700 font-medium text-xs mb-1">New Refresh Token (save this too!):</p>
                    <code className="text-xs bg-green-100 rounded px-2 py-1 break-all block">{testResult.newRefreshToken}</code>
                  </div>
                )}
                {testResult.success && (
                  <p className="mt-2 text-green-700 text-xs">
                    Now go to <strong>Dashboard → Settings → Environment Variables</strong> and update each value.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}