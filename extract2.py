import re

with open('components/CampaignEditor.tsx', 'r') as f:
    lines = f.readlines()

def get_block(start_str, end_str, start_idx=0):
    start = -1
    for i in range(start_idx, len(lines)):
        if lines[i].startswith(start_str):
            start = i
            break
    if start == -1: return -1, -1
    
    end = -1
    for i in range(start, len(lines)):
        if end_str in lines[i]:
            end = i
            break
    return start, end

s3, _ = get_block('const CR_OPTIONS =', '')
_, e3 = get_block('const EncounterHelper =', '};', s3)
s4, e4 = get_block('const RENOWN_RANKS =', '];')
s5, e5 = get_block('const AudienceBadge =', '};')

print(f"UI Block 3: {s3+1} to {e3+1}")
print(f"UI Block 4: {s4+1} to {e4+1}")
print(f"UI Block 5: {s5+1} to {e5+1}")
