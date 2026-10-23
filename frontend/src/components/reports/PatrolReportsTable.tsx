import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  ColumnDef,
} from '@tanstack/react-table';
import { 
  ChevronDown, 
  ChevronRight, 
  ChevronLeft, 
  ChevronsLeft, 
  ChevronsRight, 
  CheckCircle2, 
  AlertTriangle, 
  Search,
  MapPin,
  ArrowUpDown
} from 'lucide-react';

export interface ScanItem {
  scan_id?: string;
  id?: string;
  checkpoint_id: string;
  checkpoint_name?: string;
  scan_time?: string;
  scanned_at?: string;
  distance_meters?: number | null;
  calculated_distance_m?: number | null;
  is_gps_verified?: boolean;
  selfie_url?: string | null;
  location_photo_url?: string | null;
  photo_url?: string | null;
  remarks?: string | null;
}

export interface PatrolRoundItem {
  id?: string;
  round_id?: string;
  name?: string;
  guard_name?: string;
  guards?: { full_name?: string; employee_code?: string };
  sites?: { site_name?: string };
  start_time?: string;
  started_at?: string;
  end_time?: string | null;
  ended_at?: string | null;
  status?: string;
  scans?: ScanItem[];
}

interface PatrolReportsTableProps {
  rounds: PatrolRoundItem[];
  onSelectRoundForMap?: (round: PatrolRoundItem) => void;
  onExpandRound?: (roundId: string) => void;
}

export const PatrolReportsTable: React.FC<PatrolReportsTableProps> = ({ 
  rounds = [], 
  onSelectRoundForMap,
  onExpandRound
}) => {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const [globalFilter, setGlobalFilter] = useState('');

  const toggleRow = (roundId: string) => {
    setExpandedRows((prev) => {
      const willExpand = !prev[roundId];
      if (willExpand && onExpandRound) {
        onExpandRound(roundId);
      }
      return { ...prev, [roundId]: willExpand };
    });
  };

  const columns = useMemo<ColumnDef<PatrolRoundItem>[]>(
    () => [
      {
        id: 'expander',
        header: () => null,
        cell: ({ row }) => {
          const rId = row.original.round_id || row.original.id || String(row.index);
          return (
            <button
              type="button"
              onClick={() => toggleRow(rId)}
              className="p-1 text-slate-500 hover:text-slate-800 transition"
              title="Expand Scans"
            >
              {expandedRows[rId] ? (
                <ChevronDown className="w-5 h-5" />
              ) : (
                <ChevronRight className="w-5 h-5" />
              )}
            </button>
          );
        },
      },
      {
        accessorKey: 'name',
        header: 'Round / Site',
        cell: ({ row }) => (
          <div>
            <div className="font-semibold text-slate-900">
              {row.original.name || row.original.sites?.site_name || 'Standard Patrol'}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              ID: {(row.original.round_id || row.original.id || '').substring(0, 8)}
            </div>
          </div>
        ),
      },
      {
        accessorKey: 'guard_name',
        header: 'Assigned Guard',
        cell: ({ row }) => (
          <div>
            <div className="font-medium text-slate-800">
              {row.original.guard_name || row.original.guards?.full_name || 'Rahul Sharma'}
            </div>
            {row.original.guards?.employee_code && (
              <div className="text-[11px] text-slate-400">
                Code: {row.original.guards.employee_code}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'start_time',
        accessorFn: (row) => row.start_time || row.started_at,
        header: 'Started At',
        cell: ({ getValue }) => {
          const val = getValue<string>();
          return val ? new Date(val).toLocaleString() : '—';
        },
      },
      {
        id: 'end_time',
        accessorFn: (row) => row.end_time || row.ended_at,
        header: 'Completed At',
        cell: ({ getValue }) => {
          const val = getValue<string>();
          return val ? new Date(val).toLocaleString() : 'In Progress';
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status || 'COMPLETED';
          const isDone = status === 'COMPLETED';
          return (
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                isDone
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}
            >
              {status}
            </span>
          );
        },
      },
      {
        id: 'actions',
        header: 'Map View',
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onSelectRoundForMap && onSelectRoundForMap(row.original)}
            className="inline-flex items-center gap-1.5 rounded bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-600 border border-blue-200 hover:bg-blue-50 transition"
          >
            <MapPin className="w-3.5 h-3.5" /> View Map
          </button>
        ),
      },
    ],
    [expandedRows, onSelectRoundForMap]
  );

  const table = useReactTable({
    data: rounds,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    initialState: {
      pagination: { pageSize: 10 },
    },
  });

  return (
    <div className="bg-white rounded-xl shadow border border-slate-200 overflow-hidden">
      {/* Top Search Toolbar */}
      <div className="p-4 border-b border-slate-200 flex items-center justify-between">
        <div className="relative w-72">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={globalFilter ?? ''}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search rounds or guards..."
            className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="text-sm text-slate-500">
          Total: <span className="font-semibold text-slate-800">{rounds.length}</span> rounds
        </div>
      </div>

      {/* Main Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-600">
          <thead className="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 uppercase text-xs">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th 
                    key={header.id} 
                    className="px-4 py-3 cursor-pointer select-none hover:bg-slate-100 transition"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <div className="flex items-center gap-1.5">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && (
                        <ArrowUpDown className="w-3 h-3 text-slate-400" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-100">
            {table.getRowModel().rows.length > 0 ? (
              table.getRowModel().rows.map((row) => {
                const rId = row.original.round_id || row.original.id || String(row.index);
                return (
                  <React.Fragment key={rId}>
                    <tr className="hover:bg-slate-50/75 transition">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>

                    {/* Expandable Checkpoint Scan Details */}
                    {expandedRows[rId] && (
                      <tr className="bg-slate-50/50">
                        <td colSpan={columns.length} className="px-6 py-4 border-y border-slate-200/60">
                          <CheckpointScansSubTable scans={row.original.scans || []} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            ) : (
              <tr>
                <td colSpan={columns.length} className="text-center py-8 text-slate-400">
                  No patrol rounds found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="px-4 py-3 border-t border-slate-200 flex items-center justify-between">
        <div className="text-xs text-slate-500">
          Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount() || 1}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => table.setPageIndex(table.getPageCount() - 1)}
            disabled={!table.getCanNextPage()}
            className="p-1.5 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
          >
            <ChevronsRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Sub-table rendering side-by-side verification photos and scan details
const CheckpointScansSubTable: React.FC<{ scans: ScanItem[] }> = ({ scans }) => {
  if (!scans || scans.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400 italic">
        No checkpoint scans recorded or currently loading...
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg bg-white overflow-hidden shadow-sm">
      <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wide">
        Checkpoint Scans Timeline & Photo Proofs ({scans.length})
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {scans.map((scan, idx) => {
          const scanTime = scan.scanned_at || scan.scan_time;
          const distance = scan.calculated_distance_m ?? scan.distance_meters;
          const selfie = scan.selfie_url || scan.photo_url;
          const locationPhoto = scan.location_photo_url || scan.photo_url;

          return (
            <div key={scan.scan_id || scan.id || idx} className="border border-slate-200 rounded-lg p-3 bg-slate-50/50">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase">Stop #{idx + 1}</span>
                  <div className="text-xs font-bold text-slate-800">
                    {scan.checkpoint_name || scan.checkpoint_id}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {scanTime ? new Date(scanTime).toLocaleTimeString() : '—'}
                  </div>
                </div>
                <div>
                  {scan.is_gps_verified ? (
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                      <CheckCircle2 className="w-3 h-3" /> Pass (&le;50m)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                      <AlertTriangle className="w-3 h-3" /> Drift ({distance ? Number(distance).toFixed(0) : '?'}m)
                    </span>
                  )}
                </div>
              </div>

              {/* Side-by-side Guard Selfie & Location Photo */}
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <span className="text-[10px] font-medium text-slate-500 block mb-1">Guard Selfie</span>
                  <div className="aspect-square bg-slate-200 rounded border border-slate-300 overflow-hidden flex items-center justify-center">
                    {selfie ? (
                      <img src={selfie} alt="Guard Selfie" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-slate-400">No Photo</span>
                    )}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-medium text-slate-500 block mb-1">Location Proof</span>
                  <div className="aspect-square bg-slate-200 rounded border border-slate-300 overflow-hidden flex items-center justify-center">
                    {locationPhoto ? (
                      <img src={locationPhoto} alt="Location Proof" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-[10px] text-slate-400">No Photo</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PatrolReportsTable;