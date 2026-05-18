export interface Sector {
    id?: string; 
    title: string;
    start?: string;
    end?: string;
    date?: string;       // "YYYY-MM-DD"  
    days?: number[];     // 0=Sun … 6=Sat; empty = one-time  
    color?: string;      // hex color  
}