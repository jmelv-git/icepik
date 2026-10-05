export type Status = "confirmed" | "suspected";

export type Report = {
  id: string;
  lat: number;
  lon: number;
  address: string;
  title: string;
  time: string;
  reporter: string;
  status: Status;
  photoCount: number;
  // Stand-in for the report photo until uploads exist.
  accent: "purple" | "green" | "gray";
  comments: { author: string; body: string }[];
};

// Sample data that mirrors the design mockup.
export const reports: Report[] = [
  {
    id: "1",
    lat: 26.1244,
    lon: -80.1435,
    address: "400 North 5th Street",
    title: "Unmarked White Vans & Officers Outside Train Station",
    time: "2 hours ago",
    reporter: "Flying Seal",
    status: "confirmed",
    photoCount: 3,
    accent: "purple",
    comments: [
      {
        author: "Flying Seal",
        body: "Two white vans parked at the corner around 1pm. Officers in vests were stopping people near the station entrance.",
      },
    ],
  },
  {
    id: "2",
    lat: 26.1065,
    lon: -80.1515,
    address: "Southwest 24th Street & Marina Boulevard",
    title: "Officers checking IDs near the bus stop",
    time: "48 min ago",
    reporter: "Blue Finch",
    status: "confirmed",
    photoCount: 1,
    accent: "green",
    comments: [],
  },
  {
    id: "3",
    lat: 26.1172,
    lon: -80.1378,
    address: "Davie Boulevard & South Andrews Avenue",
    title: "Possible unmarked vehicles parked outside",
    time: "3 hours ago",
    reporter: "Quiet Harbor",
    status: "suspected",
    photoCount: 0,
    accent: "gray",
    comments: [],
  },
];
