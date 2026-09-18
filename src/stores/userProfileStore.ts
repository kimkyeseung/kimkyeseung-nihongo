import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UserProfileState {
  name: string;
  setName: (name: string) => void;
}

export const useUserProfileStore = create<UserProfileState>()(
  persist(
    (set) => ({
      name: "",
      // **여기서 trim하지 말 것.** 타이핑 중간마다 끝 공백이 잘려서 "홍 길동"처럼 공백이 든
      // 이름을 아예 칠 수 없었다(공백 다음 글자를 치기 전에 공백이 사라진다). 프롬프트에
      // 넣기 전에 sanitizeInlineValue가 trim·공백정리를 하므로 여기서 또 할 이유도 없다.
      setName: (name) => set({ name }),
    }),
    { name: "user-profile" }
  )
);
