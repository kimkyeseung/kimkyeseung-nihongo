import { create } from "zustand";

// 화면 전체에 confetti를 터뜨리기 위한 전역 트리거. persist 불필요(휘발성 UI 상태).
interface ConfettiState {
  burst: number;
  celebrate: () => void;
}

export const useConfettiStore = create<ConfettiState>((set) => ({
  burst: 0,
  celebrate: () => set((s) => ({ burst: s.burst + 1 })),
}));
