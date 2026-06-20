// Tipo canônico de Tag (deal_tags). Definido aqui para não depender do
// types.ts gerado pelo Supabase (que é sobrescrito a cada regeneração).
export interface Tag {
  id: number;
  organization_id?: string;
  name: string;
  color: string;
  created_at?: string;
}
