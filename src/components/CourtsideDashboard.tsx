"use client";

import React, { useState, useEffect } from 'react';

// --- Types ---
type Player = { id: string; name: string };
type Team = { id: string; name: string; players: Player[] };

// Mock initial data
const MOCK_TEAMS: Team[] = [
  { id: 't-a', name: 'Team A', players: [{id:'p1', name:'John'}, {id:'p2', name:'Mike'}, {id:'p3', name:'Alex'}, {id:'p4', name:'Sam'}] },
  { id: 't-b', name: 'Team B', players: [{id:'p5', name:'Chris'}, {id:'p6', name:'Dave'}, {id:'p7', name:'Tom'}, {id:'p8', name:'Will'}] },
  { id: 't-c', name: 'Team C', players: [{id:'p9', name:'Luke'}, {id:'p10', name:'Mark'}, {id:'p11', name:'Paul'}, {id:'p12', name:'Pete'}] },
];

export default function CourtsideDashboard() {
  const [isClient, setIsClient] = useState(false);
  const [teams, setTeams] = useState<Team[]>(MOCK_TEAMS);
  const [activeMatchup, setActiveMatchup] = useState<[string, string]>(['t-a', 't-b']);
  const [swapModal, setSwapModal] = useState<{ team1Id: string; p1: Player; team2Id: string; p2: Player } | null>(null);
  const [isRebalancing, setIsRebalancing] = useState(false);

  // Handle hydration mismatch and load from localStorage
  useEffect(() => {
    setIsClient(true);
    const saved = localStorage.getItem('courtside-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setTeams(parsed.teams);
        setActiveMatchup(parsed.activeMatchup);
      } catch (e) {
        console.error('Failed to parse saved state', e);
      }
    }
  }, []);

  // Sync state to localStorage
  useEffect(() => {
    if (isClient) {
      localStorage.setItem('courtside-state', JSON.stringify({ teams, activeMatchup }));
    }
  }, [teams, activeMatchup, isClient]);

  const team1 = teams.find(t => t.id === activeMatchup[0]);
  const team2 = teams.find(t => t.id === activeMatchup[1]);
  const sittingTeam = teams.find(t => t.id !== activeMatchup[0] && t.id !== activeMatchup[1]);

  const handleWin = async (winnerId: string) => {
    const loserId = activeMatchup.find(id => id !== winnerId)!;
    
    // Trigger Mock API Call
    try {
      await fetch('/api/matches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ winnerId, loserId, teams })
      });
      console.log(`Mock API: Match recorded. ${winnerId} beat ${loserId}`);
    } catch (e) {
      // Proceed even if mock fails
    }

    // Winner stays on, loser swaps with the sitting team
    setActiveMatchup([winnerId, sittingTeam!.id]);
  };

  const handleRebalance = async () => {
    if (!team1 || !team2) return;
    setIsRebalancing(true);

    try {
      // Mock API call to our TeamBalancingService route
      // await fetch('/api/rebalance', ...)
      
      // Simulating network delay and returning a mock recommendation
      await new Promise(r => setTimeout(r, 800));
      
      // Mock Recommendation: Swap Team 1's first player with Team 2's second player
      setSwapModal({ 
        team1Id: team1.id, 
        p1: team1.players[0], 
        team2Id: team2.id, 
        p2: team2.players[1] 
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsRebalancing(false);
    }
  };

  const applySwap = () => {
    if (!swapModal) return;
    
    setTeams(prev => prev.map(t => {
      if (t.id === swapModal.team1Id) {
        return { 
          ...t, 
          players: [...t.players.filter(p => p.id !== swapModal.p1.id), swapModal.p2] 
        };
      }
      if (t.id === swapModal.team2Id) {
        return { 
          ...t, 
          players: [...t.players.filter(p => p.id !== swapModal.p2.id), swapModal.p1] 
        };
      }
      return t;
    }));
    setSwapModal(null);
  };

  if (!isClient || !team1 || !team2) return <div className="min-h-screen bg-black text-white p-4" />;

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans p-4 flex flex-col safe-area-pt">
      {/* Header */}
      <header className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black tracking-tighter text-white">COURTSIDE<span className="text-emerald-400">.</span></h1>
          <p className="text-xs text-zinc-500 uppercase tracking-widest font-bold mt-1">Live Matchup</p>
        </div>
      </header>

      {/* Active Matchup Section (Massive Touch Targets) */}
      <div className="flex-1 flex flex-col gap-4">
        <button 
          onClick={() => handleWin(team1.id)}
          className="flex-1 bg-zinc-900 border-2 border-emerald-500/30 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden active:scale-[0.98] transition-transform"
        >
          <div className="absolute inset-0 bg-emerald-500/10 opacity-0 active:opacity-100 transition-opacity" />
          <h2 className="text-4xl font-black text-emerald-400 mb-2">{team1.name}</h2>
          <span className="text-lg font-bold text-white tracking-widest uppercase bg-emerald-500/20 px-6 py-2 rounded-full border border-emerald-500/50 shadow-[0_0_20px_rgba(52,211,153,0.3)]">
            Record Win
          </span>
        </button>

        <div className="flex items-center justify-center -my-2 relative z-10">
          <div className="bg-black px-4 py-2 rounded-full border border-zinc-800 text-zinc-500 font-black italic">VS</div>
        </div>

        <button 
          onClick={() => handleWin(team2.id)}
          className="flex-1 bg-zinc-900 border-2 border-cyan-500/30 rounded-3xl p-6 flex flex-col items-center justify-center relative overflow-hidden active:scale-[0.98] transition-transform"
        >
          <div className="absolute inset-0 bg-cyan-500/10 opacity-0 active:opacity-100 transition-opacity" />
          <h2 className="text-4xl font-black text-cyan-400 mb-2">{team2.name}</h2>
          <span className="text-lg font-bold text-white tracking-widest uppercase bg-cyan-500/20 px-6 py-2 rounded-full border border-cyan-500/50 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
            Record Win
          </span>
        </button>
      </div>

      {/* Controls */}
      <div className="mt-6 mb-6">
        <button 
          onClick={handleRebalance}
          disabled={isRebalancing}
          className="w-full bg-zinc-800 text-white font-bold text-lg py-4 rounded-2xl active:bg-zinc-700 disabled:opacity-50 transition-colors flex justify-center items-center gap-2"
        >
          {isRebalancing ? (
            <span className="animate-pulse">Analyzing Swaps...</span>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/></svg>
              Rebalance Teams
            </>
          )}
        </button>
      </div>

      {/* Rosters Section */}
      <div className="bg-zinc-900 rounded-3xl p-5 border border-zinc-800">
        <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-widest mb-4">Current Rosters</h3>
        <div className="flex gap-4 overflow-x-auto pb-2 snap-x">
          {teams.map(team => (
            <div key={team.id} className="min-w-[140px] snap-start">
              <div className={`font-black mb-2 ${team.id === team1.id ? 'text-emerald-400' : team.id === team2.id ? 'text-cyan-400' : 'text-zinc-500'}`}>
                {team.name} {team.id === sittingTeam?.id && "(Sitting)"}
              </div>
              <ul className="space-y-2">
                {team.players.map(p => (
                  <li key={p.id} className="bg-black px-3 py-2 rounded-xl text-sm font-medium border border-zinc-800/50">
                    {p.name}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      {/* Swap Confirmation Modal */}
      {swapModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 shadow-2xl">
            <h3 className="text-xl font-black text-white mb-2">Rebalance Recommended</h3>
            <p className="text-zinc-400 text-sm mb-6">Applying this swap will bring the team skill ratings closer together.</p>
            
            <div className="flex justify-between items-center bg-black p-4 rounded-2xl border border-zinc-800 mb-6 relative">
              <div className="text-center flex-1">
                <span className="block text-xs font-bold text-zinc-500 mb-1">{team1.name}</span>
                <span className="font-bold text-emerald-400 text-lg">{swapModal.p1.name}</span>
              </div>
              <div className="px-4 text-amber-400">
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/></svg>
              </div>
              <div className="text-center flex-1">
                <span className="block text-xs font-bold text-zinc-500 mb-1">{team2.name}</span>
                <span className="font-bold text-cyan-400 text-lg">{swapModal.p2.name}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => setSwapModal(null)}
                className="flex-1 bg-transparent border border-zinc-700 text-white font-bold py-3 rounded-xl"
              >
                Cancel
              </button>
              <button 
                onClick={applySwap}
                className="flex-1 bg-amber-500 text-black font-black py-3 rounded-xl shadow-[0_0_15px_rgba(245,158,11,0.4)]"
              >
                Apply Swap
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
