<script setup lang="ts">
import { useMock, useEntity } from '~/composables/useMock'

const data = useMock()
const comp = useEntity('competitions')

const stats = [
  { key: 'competitions', label: '대회', icon: '<path d="M6 9a6 6 0 0 0 12 0V4H6Z"/><path d="M6 5H3v2a3 3 0 0 0 3 3M18 5h3v2a3 3 0 0 1-3 3"/><path d="M12 15v4M8 21h8"/>', unit: '개', foot: '진행중 1' },
  { key: 'athletes', label: '선수', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', unit: '명', foot: '이번 시즌 등록' },
  { key: 'teams', label: '팀', icon: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 5.5a3.5 3.5 0 0 1 0 7"/>', unit: '팀', foot: '전국' },
  { key: 'times', label: '기록', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', unit: '건', foot: '누적 기록' },
  { key: 'images', label: '사진', icon: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m4 18 5-5 4 4 3-3 4 4"/>', unit: '장', foot: '검수 대기 2' },
]
const count = (k: string) => data[k]?.rows.length ?? 0
</script>

<template>
  <div>
    <PageHeader
      title="개요" en="Overview"
      subtitle="Swimming Photography 데이터 현황을 한눈에 확인합니다."
    />

    <div class="stats">
      <div v-for="s in stats" :key="s.key" class="stat">
        <div class="st-label">
          <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" v-html="s.icon" /></span>
          {{ s.label }}
        </div>
        <div class="st-value">{{ count(s.key) }}<span class="unit">{{ s.unit }}</span></div>
        <div class="st-foot">{{ s.foot }}</div>
      </div>
    </div>

    <div class="page-head" style="margin-bottom:14px">
      <div class="ph-main"><h1 style="font-size:16px">최근 대회</h1></div>
      <div class="ph-actions">
        <NuxtLink to="/competitions" class="btn btn-ghost">전체 보기</NuxtLink>
      </div>
    </div>
    <DataTable :columns="comp.columns" :rows="comp.rows" search-placeholder="대회 검색…" />
  </div>
</template>
