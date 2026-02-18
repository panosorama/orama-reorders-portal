import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

export default function OrderPreview({ mockupUrl, productType, specifications, quantity, pricing, shippingCharge, shippingMethod, shipToAddress, onShipToAddressChange, onApprove, isProcessing }) {
  const [zoom, setZoom] = useState(100);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isFullscreen, setIsFullscreen] = useState(false);

  const handleZoom = (amount) => {
    setZoom(prev => Math.max(50, Math.min(300, prev + amount)));
  };

  const handleFitToView = () => {
    setZoom(100);
    setPanX(0);
    setPanY(0);
  };

  const handleMouseDown = (e) => {
    if (zoom > 100) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging && zoom > 100) {
      const maxPan = (zoom - 100) * 0.5;
      const newX = Math.max(-maxPan, Math.min(maxPan, (e.clientX - dragStart.x)));
      const newY = Math.max(-maxPan, Math.min(maxPan, (e.clientY - dragStart.y)));
      setPanX(newX);
      setPanY(newY);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const PreviewContent = ({ standalone = false }) => (
    <div className={`flex flex-col gap-4 ${standalone ? 'p-6' : ''}`}>
      {/* Controls */}
      <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleZoom(-25)}
            disabled={zoom === 50}
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          
          <div className="flex items-center gap-2">
            <input
              type="range"
              min="50"
              max="300"
              value={zoom}
              onChange={(e) => setZoom(parseInt(e.target.value))}
              className="w-32 h-2 bg-slate-300 rounded-lg appearance-none cursor-pointer"
              title="Zoom slider"
            />
            <span className="font-medium text-sm w-12 text-right">{zoom}%</span>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleZoom(25)}
            disabled={zoom === 300}
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleFitToView}
            title="Fit to view"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          
          {standalone && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsFullscreen(false)}
              title="Close fullscreen"
            >
              ✕
            </Button>
          )}
        </div>
      </div>

      {/* Preview Container */}
      <div
        className={`bg-gray-50 rounded-lg border border-slate-200 flex items-center justify-center overflow-hidden ${
          standalone ? 'h-screen' : 'h-96'
        } cursor-${zoom > 100 ? 'grab' : 'default'} active:cursor-grabbing`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ userSelect: 'none' }}
      >
        {mockupUrl && (
          <img
            src={mockupUrl}
            alt={productType}
            className="rounded-lg shadow-lg transition-transform"
            style={{
              transform: `scale(${zoom / 100}) translate(${panX}px, ${panY}px)`,
              transformOrigin: 'center',
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
            }}
            draggable={false}
          />
        )}
      </div>
    </div>
  );

  if (isFullscreen) {
    return (
      <div className="fixed inset-0 bg-black z-50 p-4">
        <PreviewContent standalone={true} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PreviewContent />

      {/* Product Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
          <h4 className="font-semibold mb-2 text-sm">Specifications:</h4>
          <p className="text-sm text-slate-700 whitespace-pre-line max-h-40 overflow-y-auto">
            {specifications}
          </p>
        </div>

        <div className="space-y-3">
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800 font-medium">{productType}</p>
            <p className="text-xs text-blue-700 mt-1">Qty: {quantity || 1}</p>
          </div>

          {(shippingMethod === "blind_ship" || !shippingMethod) && onShipToAddressChange && (
            <div className="bg-white p-3 rounded-lg border border-slate-200">
              <p className="text-xs font-semibold text-slate-600 mb-1">📦 Ship To Address</p>
              <Input
                value={shipToAddress || ""}
                onChange={(e) => onShipToAddressChange(e.target.value)}
                placeholder="Enter shipping address..."
                className="text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">You can update this before approving</p>
            </div>
          )}
          {shippingMethod === "office_pickup" && (
            <div className="bg-green-50 p-3 rounded-lg border border-green-200">
              <p className="text-sm text-green-800 font-medium">📍 Office Pickup</p>
            </div>
          )}

          <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-semibold">${pricing.toFixed(2)}</span>
            </div>
            {shippingCharge && shippingCharge > 0 && (
              <div className="flex justify-between text-sm pt-2 border-t border-slate-200">
                <span className="text-gray-600">Shipping:</span>
                <span className="font-semibold">${shippingCharge.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between items-center pt-2 border-t border-slate-200">
              <span className="font-semibold">Total:</span>
              <span className="text-lg font-bold">${(pricing + (shippingCharge || 0)).toFixed(2)}</span>
            </div>
            <p className="text-xs text-gray-500 text-right">+ tax</p>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <Button
        onClick={onApprove}
        disabled={isProcessing}
        className="w-full bg-black hover:bg-gray-800 text-white h-10"
      >
        {isProcessing ? 'Processing...' : 'Approve & Pay'}
      </Button>
    </div>
  );
}