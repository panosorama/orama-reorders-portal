import React from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "../utils";

export default function PageHeader({ backTo, backLabel, actions, onSignOut }) {
  return (
    <div className="bg-white border-b border-slate-200 shadow-sm">
      <div className="h-1 bg-gradient-to-r from-[#EF4444] to-[#f97316]" />
      <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69934b2bd076a1f3a472ce61/f4868db7a_Untitleddesign12.png"
            alt="Orama Business Solutions"
            className="h-10 w-auto object-contain"
          />
          {backTo && (
            <>
              <div className="w-px h-6 bg-slate-200" />
              <Link to={createPageUrl(backTo)}>
                <Button variant="ghost" size="sm" className="gap-1.5 text-slate-600 hover:text-slate-900">
                  <ArrowLeft className="w-4 h-4" />
                  {backLabel || "Back"}
                </Button>
              </Link>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
          {onSignOut && (
            <Button variant="outline" size="sm" onClick={onSignOut} className="gap-2">
              <LogOut className="w-4 h-4" />
              Sign Out
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}