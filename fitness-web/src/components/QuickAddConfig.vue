<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import { useQuickAddStore } from '@/stores/quickadd'
import type { QuickAddFood } from '@/types'

const quickAddStore = useQuickAddStore()

const editingFood = ref<QuickAddFood | null>(null)
const isAdding = ref(false)
const deletingId = ref<number | null>(null)

const isDeleting = computed(() => deletingId.value !== null)

const form = reactive({
  name: '',
  unit: '',
  amount: 0,
  calories: 0,
  fatGrams: 0,
  carbsGrams: 0,
  proteinGrams: 0,
  sugarGrams: 0
})

function resetForm() {
  form.name = ''
  form.unit = ''
  form.amount = 0
  form.calories = 0
  form.fatGrams = 0
  form.carbsGrams = 0
  form.proteinGrams = 0
  form.sugarGrams = 0
}

function startAdd() {
  resetForm()
  editingFood.value = null
  isAdding.value = true
}

function startEdit(food: QuickAddFood) {
  form.name = food.name
  form.unit = food.unit
  form.amount = food.amount
  form.calories = food.calories
  form.fatGrams = food.fatGrams
  form.carbsGrams = food.carbsGrams
  form.proteinGrams = food.proteinGrams
  form.sugarGrams = food.sugarGrams
  editingFood.value = food
  isAdding.value = true
}

function cancelEdit() {
  resetForm()
  editingFood.value = null
  isAdding.value = false
}

async function handleSubmit() {
  const foodData = {
    name: form.name,
    unit: form.unit,
    amount: form.amount,
    calories: form.calories,
    fatGrams: form.fatGrams,
    carbsGrams: form.carbsGrams,
    proteinGrams: form.proteinGrams,
    sugarGrams: form.sugarGrams
  }

  if (editingFood.value) {
    await quickAddStore.updateFood(editingFood.value.id, foodData)
  } else {
    await quickAddStore.createFood(foodData)
  }

  cancelEdit()
}

async function handleDelete(food: QuickAddFood) {
  deletingId.value = food.id
  await quickAddStore.deleteFood(food.id)
  deletingId.value = null
}
</script>

<template>
  <div class="quick-add-config">
    <div class="config-header">
      <h3>Quick Add Foods</h3>
      <button v-if="!isAdding" class="add-button" @click="startAdd">+ Add Food</button>
    </div>

    <div v-if="isAdding" class="config-form">
      <h4>{{ editingFood ? 'Edit Food' : 'New Food' }}</h4>

      <div class="form-group">
        <label>Name</label>
        <input v-model="form.name" type="text" placeholder="Chicken Breast" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Amount</label>
          <input v-model.number="form.amount" type="number" step="0.1" placeholder="4" />
        </div>
        <div class="form-group">
          <label>Unit</label>
          <input v-model="form.unit" type="text" placeholder="oz" />
        </div>
      </div>

      <div class="form-group">
        <label>Calories</label>
        <input v-model.number="form.calories" type="number" placeholder="140" />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Fat (g)</label>
          <input v-model.number="form.fatGrams" type="number" step="0.1" placeholder="3" />
        </div>
        <div class="form-group">
          <label>Carbs (g)</label>
          <input v-model.number="form.carbsGrams" type="number" step="0.1" placeholder="0" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label>Protein (g)</label>
          <input v-model.number="form.proteinGrams" type="number" step="0.1" placeholder="26" />
        </div>
        <div class="form-group">
          <label>Sugar (g)</label>
          <input v-model.number="form.sugarGrams" type="number" step="0.1" placeholder="0" />
        </div>
      </div>

      <div class="form-actions">
        <button class="cancel-button" @click="cancelEdit" :disabled="quickAddStore.loading">Cancel</button>
        <button
          class="save-button"
          @click="handleSubmit"
          :disabled="!form.name || !form.unit || quickAddStore.loading"
        >
          <span v-if="quickAddStore.loading" class="loading-spinner"></span>
          <span v-else>{{ editingFood ? 'Update' : 'Add' }}</span>
        </button>
      </div>
    </div>

    <div v-else class="food-list">
      <div v-if="quickAddStore.foods.length === 0" class="empty-list">
        No foods configured yet.
      </div>
      <div
        v-for="food in quickAddStore.foods"
        :key="food.id"
        class="food-list-item"
      >
        <div class="food-details">
          <div class="food-name">{{ food.name }}</div>
          <div class="food-meta">{{ food.amount }} {{ food.unit }} - {{ food.calories }} cal</div>
        </div>
        <div class="food-actions">
          <button class="edit-button" @click="startEdit(food)" :disabled="isDeleting">Edit</button>
          <button
            class="delete-button"
            @click="handleDelete(food)"
            :disabled="isDeleting"
          >
            <span v-if="deletingId === food.id" class="loading-spinner loading-spinner--small"></span>
            <span v-else>Delete</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quick-add-config {
  width: 300px;
  background: var(--color-surface);
  flex-direction: column;
  overflow: hidden;
}

.config-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.config-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.add-button {
  padding: 8px 12px;
  background: var(--color-calorie-primary);
  color: white;
  border: none;
  border-radius: var(--border-radius);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.config-form {
  padding: var(--spacing-md);
  overflow-y: auto;
}

.config-form h4 {
  margin: 0 0 var(--spacing-md) 0;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.form-group {
  margin-bottom: var(--spacing-sm);
}

.form-group label {
  display: block;
  font-size: 12px;
  color: var(--color-text-secondary);
  margin-bottom: 4px;
}

.form-group input {
  width: 100%;
  padding: 10px;
  background: var(--color-background);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: var(--color-text);
  font-size: 14px;
}

.form-group input:focus {
  outline: none;
  border-color: var(--color-calorie-primary);
}

.form-row {
  display: flex;
  gap: var(--spacing-sm);
}

.form-row .form-group {
  flex: 1;
}

.form-actions {
  display: flex;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

.cancel-button,
.save-button {
  flex: 1;
  padding: 10px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.cancel-button {
  background: transparent;
  color: var(--color-text-secondary);
  border: 1px solid var(--color-text-secondary);
}

.save-button {
  background: var(--color-calorie-primary);
  color: white;
}

.save-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.food-list {
  flex: 1;
  overflow-y: auto;
  padding: var(--spacing-sm);
}

.empty-list {
  padding: var(--spacing-lg);
  text-align: center;
  color: var(--color-text-secondary);
}

.food-list-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm);
  background: var(--color-background);
  border-radius: 8px;
  margin-bottom: var(--spacing-sm);
}

.food-details {
  flex: 1;
  min-width: 0;
}

.food-name {
  font-weight: 600;
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.food-meta {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.food-actions {
  display: flex;
  gap: 4px;
}

.edit-button,
.delete-button {
  padding: 6px 10px;
  border: none;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.edit-button {
  background: rgba(255, 255, 255, 0.1);
  color: var(--color-text);
}

.delete-button {
  background: rgba(239, 68, 68, 0.2);
  color: #ef4444;
}

.edit-button:disabled,
.delete-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cancel-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.loading-spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.loading-spinner--small {
  width: 12px;
  height: 12px;
  border-width: 2px;
  border-color: rgba(239, 68, 68, 0.3);
  border-top-color: #ef4444;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
