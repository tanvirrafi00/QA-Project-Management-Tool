'use client';

import { Bell, Search } from 'lucide-react';
import { useState } from 'react';
import { UserMenu } from './UserMenu';

export function Header() {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-[#E2E8F0] px-8 flex items-center justify-between flex-shrink-0 overflow-hidden">
      {/* Search Bar */}
      <div className="flex-1 max-w-xl min-w-0">
        <div
          className={`relative transition-all duration-200 ${searchFocused ? 'scale-[1.01]' : ''
            }`}
        >
          <Search
            className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 transition-colors flex-shrink-0 ${searchFocused ? 'text-[#06B6D4]' : 'text-[#94A3B8]'
              }`}
          />
          <input
            type="text"
            placeholder="Search requirements, test cases..."
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            className={`w-full h-10 pl-11 pr-4 bg-[#F8FAFC] border rounded-xl text-sm text-[#1E293B] placeholder:text-[#94A3B8] focus:outline-none transition-all duration-200 ${searchFocused
              ? 'border-[#06B6D4] ring-2 ring-[#06B6D4]/10'
              : 'border-[#CBD5E1]'
              }`}
          />
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-4 ml-6 flex-shrink-0">
        {/* Notification */}
        <button className="w-10 h-10 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] flex items-center justify-center text-[#64748B] hover:text-[#1E293B] hover:border-[#06B6D4] transition-all duration-200 flex-shrink-0">
          <Bell className="w-4 h-4" />
        </button>

        {/* Profile / User menu (logout) */}
        <UserMenu />
      </div>
    </header>
  );
}
